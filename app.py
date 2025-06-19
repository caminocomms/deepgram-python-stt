import logging
import os
import json
import base64
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
from dotenv import load_dotenv
from deepgram import (
    DeepgramClient,
    LiveTranscriptionEvents,
    LiveOptions,
    DeepgramClientOptions,
)
from common.batch_audio import process_audio
from common.audio_settings import detect_audio_settings
import logging

import sounddevice as sd

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Initialize Flask and SocketIO
app = Flask(__name__)
socketio = SocketIO(
    app,
    cors_allowed_origins="*"  # Allow all origins since we're in development
)

API_KEY = os.getenv("DEEPGRAM_API_KEY")

# Load default configuration
with open("config/defaults.json", "r") as f:
    DEFAULT_CONFIG = json.load(f)

# Set up client configuration
config = DeepgramClientOptions(
    verbose=logging.INFO,
    options={"keepalive": "true"},
)

deepgram = None
dg_connection = None

# Flask routes
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/config/defaults.json")
def get_defaults():
    return jsonify(DEFAULT_CONFIG)

# Deepgram connection handling
def initialize_deepgram_connection(config_options=None):
    global dg_connection, deepgram, config

    if not config_options:
        logger.warning("No configuration options provided")
        return

    # Update client config with base URL and create new client
    if "baseUrl" in config_options:
        base_url = config_options.pop("baseUrl")
        config.url = f"wss://{base_url}"  # Use wss:// for secure WebSocket
        deepgram = DeepgramClient(API_KEY, config)

    if not deepgram:
        logger.warning("No base URL provided")
        return

    dg_connection = deepgram.listen.websocket.v("1")

    def on_open(self, open, **kwargs):
        logger.info(f"\n\n{open}\n\n")

    def on_message(self, result, **kwargs):
        transcript = result.channel.alternatives[0].transcript
        if len(transcript) > 0:
            timing = {"start": result.start, "end": result.start + result.duration}
            socketio.emit(
                "transcription_update",
                {
                    "transcription": transcript,
                    "is_final": result.is_final,
                    "timing": timing,
                },
            )

    def on_close(self, close, **kwargs):
        logger.info(f"\n\n{close}\n\n")

    def on_error(self, error, **kwargs):
        logger.info(f"\n\n{error}\n\n")

    dg_connection.on(LiveTranscriptionEvents.Open, on_open)
    dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
    dg_connection.on(LiveTranscriptionEvents.Close, on_close)
    dg_connection.on(LiveTranscriptionEvents.Error, on_error)
    
    options = LiveOptions(**config_options)

    logger.info(f"Starting Deepgram connection with options: {options}")
    
    if dg_connection.start(options) is False:
        logger.warning("Failed to start connection")
        exit()

# SocketIO event handlers
@socketio.on("audio_stream")
def handle_audio_stream(data):
    if dg_connection:
        dg_connection.send(data)

@socketio.on("toggle_transcription")
def handle_toggle_transcription(data):
    global dg_connection
    logger.info("toggle_transcription", data)
    action = data.get("action")
    if action == "start":
        logger.info("Starting Deepgram connection")
        config = data.get("config", {})
        initialize_deepgram_connection(config)
    elif action == "stop" and dg_connection:
        logger.info("Closing Deepgram connection")
        dg_connection.finish()
        dg_connection = None

@socketio.on("connect")
def server_connect():
    logger.info("Client connected")

@socketio.on("restart_deepgram")
def restart_deepgram():
    logger.info("Restarting Deepgram connection")
    initialize_deepgram_connection()

@socketio.on("detect_audio_settings")
def handle_detect_audio_settings():
    logger.info("Detecting audio settings")
    settings = detect_audio_settings(socketio)
    return settings

@socketio.on("upload_file")
def handle_file_upload(data):
    if "file" not in data:
        logger.warning("Error: No file provided in data")
        return {"error": "No file provided"}, 400

    file = data["file"]
    if not file:
        logger.warning("Error: Empty file object")
        return {"error": "No file selected"}, 400

    logger.info(f"Received file: {file['name']}")
    logger.info(f"File data length: {len(file['data'])}")

    # Save file temporarily
    temp_dir = "temp"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file["name"])
    logger.info(f"Will save to: {file_path}")

    # Save the file
    try:
        file_data = base64.b64decode(file["data"].split(",")[1])
        logger.info(f"Decoded file size: {len(file_data)} bytes")
        with open(file_path, "wb") as f:
            f.write(file_data)
        logger.info(f"File saved successfully to {file_path}")
    except Exception as e:
        logger.warning(f"Error saving file: {str(e)}")
        return {"error": f"Error saving file: {str(e)}"}, 500

    try:
        # Use the config parameters from the client
        params = data.get("config", {})
        # Remove base_url as it's not needed for file processing
        params.pop("baseUrl", None)
        logger.info("Processing audio")
        logger.debug(f"- with params: {params}")
        result = process_audio(file_path, params)
        logger.info(f"Processing result: {result}")

        # Clean up
        os.remove(file_path)
        logger.info(f"Temporary file removed: {file_path}")
        return result
    except Exception as e:
        logger.warning(f"Error processing audio: {str(e)}")
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Temporary file removed after error: {file_path}")
        return {"error": str(e)}, 500

if __name__ == "__main__":
    logging.info("Starting combined Flask-SocketIO server")
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, port=8001)
