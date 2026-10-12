import os
from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
from werkzeug.utils import secure_filename
import math
from utilities import *
import json
from pathlib import Path

# --- CONFIGURATION ---

# Initialize the Flask application
app = Flask(__name__)

cwd = os.getcwd()

# Define where uploaded files will be stored
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

#Define full transcripts folder
FULL_TRANSCRIPTS_FOLDER = f'{cwd}/uploads/full_transcripts'
app.config['FULL_TRANSCRIPTS_FOLDER'] = FULL_TRANSCRIPTS_FOLDER

# Ensure the upload directory exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Define which file extensions are allowed for safety
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'ogg', 'mp4', 'mov'}

@app.route('/')
def index():
    return render_template('index.html')

#Method to save the transcript dictionary into the text chunks
@app.route('/finalize_transcript', methods=['POST'])
def finalize_transcript():
    transcripts = request.get_json()

    #Get the name of the original file- I have it saved as part of the transcript object
    original_file = Path(transcripts['filename']).stem

    if not os.path.isdir(f'data/text/{original_file}'):
        os.mkdir(f'data/text/{original_file}')
            
    for chunk in transcripts['chunks']:
        print(chunk)
        filename = Path(chunk['filepath']).stem
            
        with open(f'data/text/{original_file}/{filename}.txt', 'w') as f:
            f.write(chunk['transcript'])
    
    return jsonify({'message':'success'})

#Method to save the transcript dictionary into the text chunks
@app.route('/save_transcript', methods=['POST'])
def save_transcript():
    transcripts = request.get_json()

    #Get the name of the original file- I have it saved as part of the transcript object
    filename = transcripts['filename']

    filename = os.path.splitext(filename)[0]

    with open(f'uploads/transcripts/{filename}.json', 'w') as f:
        json.dump(transcripts, f)

    #Iterate over transcripts and turn it into a full text transcript
    full_transcript = ""

    for chunk in transcripts['chunks']:
        full_transcript += f"{chunk['transcript']}\n"

    with open(f'uploads/full_transcripts/{filename}.txt', 'w') as f:
        f.write(full_transcript)
    
    return jsonify({'message':'success'})

'''
A simple function to export the text file that contains the transcript in its current state.
'''
@app.route('/export/<filename>', methods=['GET'])
def export(filename):

    filename = os.path.splitext(filename)[0]
    
    txt_file = f"{filename}.txt"

    return send_from_directory(f'/home/peyton/Projects/cajun_english_full/cajun_english/cajun_english_website/uploads/full_transcripts', txt_file)

'''
Simple function to return a previously uploaded file from selection in the manual application workflow.
'''

@app.route('/select/<filename>', methods=['POST'])
def select(filename):
    is_uploaded, upload_dict = already_uploaded(filename)

    print('Returning a previously uploaded file')
    with open(upload_dict[filename], 'r') as f:
        return_dict = json.load(f)
        
    return jsonify(return_dict), 200


#Method to handle uploading the file and sending it to the backend to chunk and process
@app.route('/upload', methods=['POST'])
def upload_file():
    #Ensure a file was properly sent through
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    
    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if file and allowed_file(file.filename):
        
        # secure_filename prevents directory traversal attacks by cleaning the name
        filename = secure_filename(file.filename)

        print(filename)

        #Check if the filename is already in the uploads_key
        is_uploaded, upload_dict = already_uploaded(filename)
        
        # Construct the final path where the file will be saved
        filepath = os.path.join(f"data/audio", filename)

        if not is_uploaded:
            print('Processing a new file')
            
            # Save the file to the server's filesystem
            file.save(filepath)

            return_dict = {}
        
            return_dict['filename'] = filename
            return_dict['finalized'] = 0
            return_dict['chunks'] = []
        
            #Return dict has a specific structure- please see the Javascript file or README for specifications
        
            # Process the audio data by chunking it and generating timestamps and filepaths- this will segment it in 30s chunks and return my json object
            try:
                return_dict['chunks'] = get_chunks(filepath)

                print(f"Return dict:{return_dict}")

                #Save the return dict into a Transcript save file
                json_name = os.path.splitext(filename)[0]
                with open(f'uploads/transcripts/{json_name}.json', 'w') as f:
                    json.dump(return_dict, f)
                
                upload_dict[filename] = f'uploads/transcripts/{json_name}.json'
                update_uploads(upload_dict)
                print(f"Update uploads:{upload_dict}")
            
                #return_dict = process_audio(filepath)
                return jsonify(return_dict), 200
            except Exception as e:
                print(f"Error processing audio or pydub dependencies missing: {e}")

                # Return the exact JSON structure requested by the user
                return jsonify({
                    "error":"oops"}), 200

        else:
            print('Returning a previously uploaded file')
            with open(upload_dict[filename], 'r') as f:
                return_dict = json.load(f)
            return jsonify(return_dict), 200
         
    return jsonify({"error": "File type not allowed"}), 400


#Check if a file has already been uploaded

def already_uploaded(filename):

    uploads = Path(f'upload_keys.json')

    #Create the upload dict if it doesn't exist
    if uploads.exists():
        with open('upload_keys.json') as f:
            upload_dict = json.load(f)
    
    else:
        upload_dict = {}

    if filename in upload_dict:
        return (True, upload_dict)
    else:
        return (False, upload_dict)

#Update the uploads json
def update_uploads(uploads):
    with open('upload_keys.json', 'w') as f:
        json.dump(uploads, f)

#Create the transcript structure for the chunk template of the transcription page. This sets the timestamps of the chunks and establishes an empty transcript
def get_chunks(filepath):
    chunks = process_audio(filepath)

    return_dict = []
    
    for chunk in chunks:
        chunk_obj = {}

        chunk_obj['filepath'] = chunk['filename']
        chunk_obj['start'] = chunk['timestamps'][0] / 100
        chunk_obj['stop'] = chunk['timestamps'][1] / 100
        chunk_obj['transcript'] = chunk['transcript']

        return_dict.append(chunk_obj)

    return return_dict

if __name__ == '__main__':
    app.run()
