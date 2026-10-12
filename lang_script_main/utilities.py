from pydub import AudioSegment
import numpy as np
import webrtcvad
import os
import matplotlib.pyplot
import wave
from pathlib import Path
from transformers import pipeline, WhisperProcessor, WhisperForConditionalGeneration, WhisperFeatureExtractor,WhisperTokenizer
import pandas as pd
from datasets import Dataset, Audio
from pathlib import Path
import torch

#Currently we only allow mp3 and wav to simplify the conversion process. As time goes on, I can add in ways to handle other file types
ALLOWED_EXTENSIONS = {'mp3', 'wav'}

# Define where chunks files will be stored
CHUNKED_FOLDER = 'chunks'

# Ensure the upload directory exists
if not os.path.exists(CHUNKED_FOLDER):
    os.makedirs(CHUNKED_FOLDER)

'''
Below is a method to transcribe a file given a filepath. The way this is currently organized, this method is only used to process 30 second chunks of text (although the pipeline means it's capable of processing larger files). Currently the model is hard-coded- in future, the model can be passed as a parameter and can be chosen by the user.
'''
def transcribe(filepath):
    print("Transcribing file")
    if torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    #m = '.model'
    m = "openai/whisper-large-v2"

    model = WhisperForConditionalGeneration.from_pretrained(m)
    processor = WhisperProcessor.from_pretrained(m)
    feature_extractor = WhisperFeatureExtractor.from_pretrained(m)
    tokenizer = WhisperTokenizer.from_pretrained(m)

    pipe = pipeline(task="automatic-speech-recognition", model=model, feature_extractor=feature_extractor, tokenizer=tokenizer, device=device)

    text = pipe(filepath)['text']
    
    return text

def allowed_file(filename):
    #Split the filename at the extension and check if it's an allowed extension (lowercased)
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

'''
A function that relies on several helper functions to process the audio and save the chunks into separate files. (Note- this is another spot for customization. If I redesign this process, the user will be able to select the desired audio duration and control chunk size- this will make the module more extensible for other models.)

1. Take in filepath and chunk filepath using chunking function
2. Iterate over each chunk and transcribe chunks if transcribe is enabled
3. Return a JSON object where each filepath for each chunk is recorded and the transcript is included (blank if no transcript)
'''

def process_audio(filepath, transcribe_enabled = True):

    #Obtain the chunk boundaries which have been split on silence
    chunk_boundaries, audio = audio_split_vad(filepath)

    original_name = Path(filepath).stem

    #Make a new folder for the chunks

    if not os.path.exists(f'{CHUNKED_FOLDER}/{original_name}'):
        Path.mkdir(Path(f'{CHUNKED_FOLDER}/{original_name}'), exist_ok=True)

    return_obj = []
    
    #Write the chunks to file and create a dict for each chunk
    for i, chunk in enumerate(chunk_boundaries):

        chunk_dict = {}

        start = chunk[0] * int(16000 * 10 / 1000) * 2
        end = chunk[1] * int(16000 * 10 / 1000) * 2

        if i < 10:
            filename = f'{CHUNKED_FOLDER}/{original_name}/{original_name}_0{i}.wav'
        else:
            filename = f'{CHUNKED_FOLDER}/{original_name}/{original_name}_{i}.wav'
                
        with wave.open(filename, mode='wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(audio.raw_data[start:end])

        transcript = transcribe(filename)
        
        chunk_dict = {}

        chunk_dict['timestamps'] = chunk
        chunk_dict['filename'] = filename
        chunk_dict['transcript'] = transcript

        return_obj.append(chunk_dict)

        print(f"Process audio complete:{return_obj}")
    return return_obj

# Give a vad (expects webrtcvad), how long you want the "frame" to be (10ms), the silence boundary you want (ie how long the silence should be where you decide to cut) and how aggressive you want the vad to be when deciding whether or not something is a human voice. Returns a list of True, False- True when the frame has voice activity, false if it doesn't. Later I should rewrite this algorithm to use some sort of AI-enabled voice activity detection- the issue is that it likely won't be as fast and in some cases may require login through Huggingface or some such. Needs exploration and research essentially.

def get_vad_boundaries(audio, vad, frame_duration_ms = 10, min_silence_ms=100, aggressiveness = 3):
    sample_rate = audio.frame_rate
    sample_width = audio.sample_width
    raw_audio = audio.raw_data

    frame_size = int(sample_rate * frame_duration_ms / 1000) * sample_width

    frames = [
        raw_audio[i:i+frame_size]
        for i in range(0, len(raw_audio), frame_size)
        if len(raw_audio[i:i+frame_size]) == frame_size
    ]

    vad_flags = [vad.is_speech(frame, sample_rate) for frame in frames]

    return vad_flags, frames


#Load a file and split it into chunks- this doesn't natively handle breaking up the chunks, instead it returns the boundaries of the chunks and you can do with that what you will

def audio_split_vad(file_path, target_length = 3000, frame_duration_ms = 10, min_silence_ms = 200, vad_aggressiveness = 3):
    
    #Loading and resampling is probably the most expensive part of this whole thing
    audio = AudioSegment.from_file(file_path)
    audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)

    vad = webrtcvad.Vad(vad_aggressiveness)

    vad_flags, frames = get_vad_boundaries(
        audio,
        vad,
        frame_duration_ms=frame_duration_ms,
        min_silence_ms=min_silence_ms,
        aggressiveness=vad_aggressiveness
    )

    #The loop below is a relatively simple algorithm. The basic idea is that, given a start boundary, a step length (the target length) we begin examining from the end_boundary, moving backwards until we find an extended period of non-vad (calculated from the min_silence_ms and the frame_duration_ms.) I think this would be O(2n) (or O(n) if you want to be pedantic.) I have added an offset so that there is a "pad" of silence at both ends of the chunk. I have had issues in the past- primarily with songs- where there is not 100ms straight of silence so I end up in an infinite loop. To handle that, I have implemented a count to where, if the loop executes for more than 30s of audio without finding an appropriate silence, I cut it at 30s.

    start_boundary = 0
    step_length = target_length #30s for len of chunks

    end_boundary = start_boundary + step_length

    chunk_boundaries = []

    while end_boundary < len(vad_flags):
        nonvad_duration = 10

        offset = 5

        current_nonvad = 0

        silence_pointer = end_boundary

        while silence_pointer >= start_boundary: #Silence_pointer is a "pointer" keeping track of where we are in our search for silence

            while current_nonvad <= nonvad_duration and silence_pointer >= start_boundary: #Begin the loop through searching for our period of silence
                if not vad_flags[silence_pointer]:
                    current_nonvad += 1
                else:
                    current_nonvad = 0
                silence_pointer += -1

            #If we break out of the above loop, we need to check if
            if silence_pointer < start_boundary: #if we traversed the entire chunk without finding an appropriate period of silence, just chunk at 30s
                chunk_boundaries.append((start_boundary, end_boundary))

                start_boundary = end_boundary
                end_boundary = start_boundary+step_length

            else:
                #Split in the middle of the period of silence
                chunk_boundaries.append((start_boundary,silence_pointer+offset))

                start_boundary = silence_pointer+offset
                end_boundary = start_boundary+step_length

    #Append the final chunk
    chunk_boundaries.append((chunk_boundaries[-1][1],len(vad_flags)))

    return chunk_boundaries, audio
