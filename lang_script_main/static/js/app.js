const key_bindings_ctrl = {
    'u':'ù',
    'a':'à',
    'e':'è',
    'U':'Ù',
    'A':'À',
    'E':'È',
    'd':'é',
    'D':'É',
};
    
const key_bindings_alt = {
    'u':'û',
    'a':'â',
    'e':'ê',
    'o':'ô',
    'i':'î',
    'c':'ç',
    'U':'Û',
    'A':'Â',
    'E':'Ê',
    'O':'Ô',
    'I':'Î',
    'C':'Ç'
};

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENT SELECTION ---
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const urlInput = document.getElementById('urlInput');
    const transcriptBox = document.getElementById('transcriptBox');
    const uploadStatus = document.getElementById('uploadStatus');
    const export_button = document.getElementById('export-button');
    const logo = document.querySelector('.logo');
    const audio_box = document.querySelector('.nav-links');
    
    // Player Elements
    const playerSection = document.getElementById('playerSection');
    const audioPlayer = document.getElementById('audioPlayer');
    const videoPlayer = document.getElementById('videoPlayer');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');
    const speedRange = document.getElementById('speedRange');
    const speedValue = document.getElementById('speedValue');
    const bottom_buttons = document.querySelector('.bottom-buttons');
    const finalize_button = document.getElementById('finalize-button');
    const filename_element = document.getElementById('filename');
    const transcript_area = document.getElementById('transcript_section');
    const audio_options = document.getElementById('audio_options');
    const pb_display = document.getElementById('audio_pb_display');
    const pbrate = document.getElementById('pbrate');
    
    //Initialize our transcript object that will store all of our transcript related functions (including chunks)
    
    const transcript_object = new Transcript();

    //###############GLOBAL EVENTS##################################################################################################################################################################

    document.addEventListener("keydown", function (e) {
	if (e.code === "ArrowLeft" && e.ctrlKey) {
            audioPlayer.currentTime = audioPlayer.currentTime - 3;
        };

        if (e.code === "ArrowRight" && e.ctrlKey) {
            audioPlayer.currentTime = audioPlayer.currentTime + 3;
        };
    });

    const display_val = val => {
	return parseInt(val * 100, 10) + '%'
    }


    pb_display.innerText = display_val(audioPlayer.playbackRate);
    pbrate.addEventListener('change', e => {
	audioPlayer.playbackRate = pbrate.value;
        pb_display.innerText = display_val(pbrate.value);
    });
    
    //#############################################################################UPLOAD FILE LOGIC################################################################################################

    //When the upload button is clicked, click the hidden File Input object
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {

	//Capture file and create a temporary URL for it- return if there's no file
        const file = e.target.files[0];
        if (!file) return;

        const fileURL = URL.createObjectURL(file);

        audioPlayer.src = fileURL;
        audio_options.style.display = 'block';
	
	//Hide the logo so the audio bar has full real estate
	logo.style.display = 'none';

        updateUploadButtonUI(file.name);

        // Send file to Python
        uploadStatus.textContent = "⏳ Sending to backend for processing...";
        uploadStatus.style.color = "#3b82f6"; // Blue

        try {

	    transcript_area.style = 'display:none;';
	    
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
		
		transcript_area.style = 'display:block;';
		
		transcript_object.refresh();

		transcript_object.update_filename(result['filename']);
		filename_element.innerText = result['filename'];
		
                uploadStatus.textContent = `✅ File successfully uploaded and processed!`;
                uploadStatus.style.color = "#10b981"; // Green
		bottom_buttons.style.display = 'block';

		//Create and set up my new textboxes with the appropriate event handlers
		for (var i = 0; i < result['chunks'].length; i++) {
		    new_txt = transcript_object.append_chunk(result['chunks'][i]);
		    setUpTextbox(new_txt, transcript_object);
		};

		console.log(transcript_object.chunks);
		
		//Autosave functionality
		window.setInterval(function () { transcript_object.save_transcript(); }, 10000);

		//Set up the audio events that will happen (like on timeupdate)
		setUpAudioEvents();

		
            } else {
                throw new Error(result.error || "Upload failed");
            }
        } catch (error) {
            uploadStatus.textContent = `❌ Error: ${error.message}`;
            uploadStatus.style.color = "#ef4444"; // Red
            console.error("Upload Error:", error);
        }
    });

    //###############################################################################SELECT BOX EVENT LOGIC############################################################################################

    const selectElement = document.getElementById("audio_selection");

    selectElement.addEventListener("change", async (event) => {

	audio_options.style.display = 'block';

	try {
	
	    const formData = new FormData();
            formData.append('filename', event.target.value);

	    filename = event.target.value;
	
	    const response = await fetch(`/select/${filename}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok) {
		transcript_area.style = 'display:block;';

		transcript_object.refresh();
		audioPlayer.src = `/static/audio/${filename}`; 
		
                transcript_object.update_filename(result['filename']);
                filename_element.innerText = result['filename'];

                uploadStatus.textContent = `✅ File successfully uploaded and processed!`;
                uploadStatus.style.color = "#10b981"; // Green
                bottom_buttons.style.display = 'block';

                //Create and set up my new textboxes with the appropriate event handlers
                for (var i = 0; i < result['chunks'].length; i++) {
                    new_txt = transcript_object.append_chunk(result['chunks'][i]);
                    setUpTextbox(new_txt, transcript_object);
                };

                console.log(transcript_object.chunks);

                //Autosave functionality
                window.setInterval(function () { transcript_object.save_transcript(); }, 10000);

                //Set up the audio events that will happen (like on timeupdate)
                setUpAudioEvents();
	    }
	}

	catch(error) {
	    uploadStatus.textContent = `❌ Error: ${error.message}`;
            uploadStatus.style.color = "#ef4444"; // Red
            console.error("Upload Error:", error);
	}
    });

    //###############################################################################ADD EVENT LOGIC TO SAVE AND FINALIZE BUTTONS######################################################################

    export_button.addEventListener('click', async function() {
	try {

	    const response = await fetch(`/export/${transcript_object.filename}`);

	    
	    const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;

	    text_filename = transcript_object.filename;
	    text_filename = text_filename.replace(/\.[^/.]+$/, "");
            a.download = text_filename+'.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
	    
	}

	catch (err) {

	    console.log(err);
	}
	
    });

    finalize_button.addEventListener('click', function() {
	transcript_object.finalize_transcript();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();

	    if(audioPlayer.paused) {
		audioPlayer.play();
	    }

	    else {
		audioPlayer.pause();
	    }
        }
    });

    function setUpAudioEvents() {
	
	audioPlayer.addEventListener('timeupdate', () => {
	    
	    if (!(audioPlayer.currentTime >= transcript_object.chunks[transcript_object.current_chunk].start && audioPlayer.currentTime < transcript_object.chunks[transcript_object.current_chunk].stop)) {
		audioPlayer.pause();
		
		setTimeout(() => {
		    audioPlayer.play();

		    for (var i = 0; i < transcript_object.chunks.length; i++) {
			    
			if (audioPlayer.currentTime >= transcript_object.chunks[i].start && audioPlayer.currentTime < transcript_object.chunks[i].stop)
			{
			    transcript_object.update_current_chunk(i);
			    transcript_object.chunks[i].chunk_element.focus();

			    //Scroll to the new element. Will see if this behavior is desirable- it feels a little abrupt to me but having it centered automatically is nice I think?
			    transcript_object.chunks[i].chunk_element.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			    });
			    
			    break;
			}
		    }
		}, 2000);
	    };

	    //Check if the current chunk has focus- update it if not
	    
	    if (!(transcript_object.chunks[transcript_object.current_chunk].chunk_element == document.activeElement)) {
		transcript_object.chunks[transcript_object.current_chunk].chunk_element.focus();
	    };

	});
    };

    /**
     * Updates the upload button style once a file is selected.
     */
    function updateUploadButtonUI(fileName) {
        uploadBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        const shortName = fileName.length > 15 ? fileName.substring(0, 15) + '...' : fileName;
        uploadBtn.innerHTML = `
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7"></path>
            </svg>
            ${shortName}
        `;
    }
});


/*
Below is the Transcript object. All things relating to the transcripts are handled here- any operations applied to the textboxes also update this "shadow object" in the background. It contains a reference to the current chunk and a reference to all chunks. 
*/

function Transcript() {
    this.chunks = [];
    this.current_chunk = 0;
    this.finalized = 0;
    this.filename = '';

    //Find the transcript container on the page
    this.transcript_container = document.querySelector('.transcript-container');
    
    this.append_chunk = function(chunk) {

	//Create the element and fill it in with everything we need
	new_txt = document.createElement("textarea");
	new_txt.innerHTML = chunk["transcript"];
	new_txt.setAttribute("class","transcript-box");
	new_txt.setAttribute("spellcheck","false");

	//Append it to the transcript container and resize around text
	this.transcript_container.append(new_txt);
	new_txt.style.height = new_txt.scrollHeight + 40 + "px";

	chunk_obj = new Chunk(filepath = chunk["filepath"], start = chunk['start'], stop = chunk['stop'], transcript = chunk["transcript"], chunk_element = new_txt);

	this.chunks.push(chunk_obj);

	new_txt.setAttribute("transcript_idx", this.chunks.length - 1);

	return new_txt;

    };

    this.export_transcript = async function() {

	try {
	    this.save_transcript();
	}

	catch {
	    console.log("Error exporting!");
	}
    };

    //Function to save the current transcripts as they are by iterating over each of the chunks and sending the text files to the backend
    this.save_transcript = async function() {

	transcript_dict = this.convert_to_dict();

	try {

	    save_success = document.getElementById("save_message");
	    
	    const response = await fetch('/save_transcript', {
		method: 'POST',
		headers: {
		    'Content-Type': 'application/json'
		},
		body: JSON.stringify(transcript_dict)
            });

            const result = await response.json();
	    
            if (response.ok) {
		save_success.style.display = "block;";
		save_success.innerText = "     Save Success!";

		window.setTimeout(function () {save_success.style.display = "None;"}, 2000);
		
		console.log('Data successfully sent');
		
	    }

	    else {
		save_success.style.display = "block;";
		save_success.innerText = "     Error saving- Please stop work and contact Peyton!";
		
		throw new Error(result.error || "Upload failed");
	    };
	}

	catch (error){
	    console.log('Error saving');

	    save_success.style.display = "block;";
	    save_success.innerText = "     Error saving- Please stop work and contact Peyton!";
	    save_success.style.color = "#ef4444"; // Red
		
	    throw new Error(result.error || "Upload failed");
	};
    };

    //Setter to update the current chunk
    this.update_current_chunk = function(idx) {
	this.current_chunk = idx;
    };

    this.update_filename = function(filename) {
	this.filename = filename;
    };

    this.refresh = function() {
	this.chunks = [];
	this.current_chunk = 0;
	this.filename = '';
	this.finalized = 0;

	textboxes = this.transcript_container.querySelectorAll('.transcript-box');

	for (var i = 0; i < textboxes.length; i++)
	{
	    textboxes[i].remove();
	}
    };

    this.convert_to_dict = function() {
	transcript_dict = {};

	transcript_dict['filename'] = this.filename;
	transcript_dict['finalized'] = this.finalized;

	//Convert the chunks to an array of dicts
	
	chunk_arr = [];

	for (var i = 0; i < this.chunks.length; i++) {
	    chunk = {};

	    chunk['filepath'] = this.chunks[i].filepath;
	    chunk['start'] = this.chunks[i].start;
	    chunk['stop'] = this.chunks[i].stop;
	    chunk['transcript'] = this.chunks[i].transcript;

	    chunk_arr.push(chunk);
	};

	transcript_dict['chunks'] = chunk_arr;
	
	return transcript_dict;
    };

    this.finalize_transcript = async function() {

	this.finalized = 1;

	transcript_dict = this.convert_to_dict();

	try {
	    
	    const response = await fetch('/finalize_transcript', {
		method: 'POST',
		headers: {
		    'Content-Type': 'application/json'
		},
		body: JSON.stringify(transcript_dict)
            });

            const result = await response.json();
	    
            if (response.ok) {
		console.log('Data successfully sent');

		textboxes = this.transcript_container.querySelectorAll('.transcript-box');

		for (var i = 0; i < textboxes.length; i++)
		{
		    textboxes[i].disabled = true;
		    textboxes[i].classList.remove("transcript-box");
		    textboxes[i].classList.add("disabled");
		};
	    }

	    else {
		throw new Error(result.error || "Upload failed");
	    };
	}

	catch (error){
	    console.log('Error saving');
	};
	
    };
}


/*This function sets up the textboxes.
  We need to check and see if the currently selected textbox is related to the audio chunk that's currently playing.
  If not, we need to update the current chunk to this one, update the start time, and focus on the selected textbox.
  We also need to make sure we update the related transcript object on input into the textbox
*/

function setUpTextbox(new_txt, transcript_object) {
    new_txt.addEventListener("click", function() {
	
	if (transcript_object.current_chunk !== parseInt(this.getAttribute('transcript_idx'))) {
	    transcript_object.update_current_chunk(parseInt(this.getAttribute('transcript_idx')));
	    audioPlayer.currentTime = transcript_object.chunks[transcript_object.current_chunk].start;
	    this.focus();

	    //Scroll to the new element. Will see if this behavior is desirable- it feels a little abrupt to me but having it centered automatically is nice I think?
	    this.scrollIntoView({
		behavior: 'smooth',
		block: 'center'
		});
	}
	    
    });

    new_txt.addEventListener('input', function() {
	transcript_object.chunks[this.getAttribute('transcript_idx')].transcript = this.value;
    });

    new_txt.addEventListener('keydown', function(e) {
	
	//Get cursor position
	const start = this.selectionStart;
	const end = this.selectionEnd;

	if ( (e.ctrlKey && key_bindings_ctrl.hasOwnProperty(e.key))) {
	    e.preventDefault();

	    this.value = this.value.substring(0, start) + key_bindings_ctrl[e.key] + this.value.substring(end);
	    
	    //Bump the cursor over to accommodate the new character

	    this.selectionStart = this.selectionEnd = start + 1;
	};

	if ( (e.altKey && key_bindings_alt.hasOwnProperty(e.key))) {
	    e.preventDefault();

	    this.value = this.value.substring(0, start) + key_bindings_alt[e.key] + this.value.substring(end);
	    
	    //Bump the cursor over to accommodate the new character

	    this.selectionStart = this.selectionEnd = start + 1;
	};
    });
};

//The Chunk object that holds all the necessary values inside each chunK
function Chunk(filepath, start, stop, transcript, chunk_element) {
    this.filepath = filepath;
    this.start = start;
    this.stop = stop;
    this.transcript = transcript;
    this.chunk_element = chunk_element;
}
