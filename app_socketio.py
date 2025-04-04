import logging
import os
import json
from flask import Flask
from flask_socketio import SocketIO
from dotenv import load_dotenv
from deepgram import (
    DeepgramClient,
    LiveTranscriptionEvents,
    LiveOptions,
    DeepgramClientOptions,
)

load_dotenv()

app_socketio = Flask("app_socketio")
socketio = SocketIO(
    app_socketio,
    cors_allowed_origins=[
        "http://localhost:8001/",
        "http://localhost:8001",
        "http://localhost:8002/",
        "http://localhost:8002",
        "http://127.0.0.1:8001/",
        "http://127.0.0.1:8001",
        "http://127.0.0.1:8002/",
        "http://127.0.0.1:8002",
    ],
)

API_KEY = os.getenv("DEEPGRAM_API_KEY")

# Load default configuration
with open("config/defaults.json", "r") as f:
    DEFAULT_CONFIG = json.load(f)

# Set up client configuration
config = DeepgramClientOptions(
    verbose=logging.INFO,  # Change to logging.INFO or logging.DEBUG for more verbose output
    options={"keepalive": "true"},
)

deepgram = None
dg_connection = None


def initialize_deepgram_connection(config_options=None):
    global dg_connection, deepgram, config

    # Update client config with base URL and create new client
    if config_options and "base_url" in config_options:
        base_url = config_options.pop("base_url")
        config.url = f"wss://{base_url}"  # Use wss:// for secure WebSocket
        deepgram = DeepgramClient(API_KEY, config)

    if not deepgram:
        print("No base URL provided")
        return

    dg_connection = deepgram.listen.websocket.v("1")  # Use websocket instead of live

    def on_open(self, open, **kwargs):
        print(f"\n\n{open}\n\n")

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
        print(f"\n\n{close}\n\n")

    def on_error(self, error, **kwargs):
        print(f"\n\n{error}\n\n")

    dg_connection.on(LiveTranscriptionEvents.Open, on_open)
    dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
    dg_connection.on(LiveTranscriptionEvents.Close, on_close)
    dg_connection.on(LiveTranscriptionEvents.Error, on_error)

    # Use default config and update with any provided options
    default_options = DEFAULT_CONFIG.copy()
    if config_options:
        default_options.update(config_options)

    # Remove base_url as it's not a valid LiveOptions parameter
    default_options.pop("base_url", None)
    options = LiveOptions(**default_options)

    if dg_connection.start(options) is False:
        print("Failed to start connection")
        exit()


@socketio.on("audio_stream")
def handle_audio_stream(data):
    if dg_connection:
        dg_connection.send(data)


@socketio.on("toggle_transcription")
def handle_toggle_transcription(data):
    global dg_connection
    print("toggle_transcription", data)
    action = data.get("action")
    if action == "start":
        print("Starting Deepgram connection")
        config = data.get("config", {})
        # Get base URL from client
        base_url = config.pop("base_url", "api.deepgram.com")
        config["base_url"] = base_url
        initialize_deepgram_connection(config)
    elif action == "stop" and dg_connection:
        print("Closing Deepgram connection")
        dg_connection.finish()
        dg_connection = None


@socketio.on("connect")
def server_connect():
    print("Client connected")


@socketio.on("restart_deepgram")
def restart_deepgram():
    print("Restarting Deepgram connection")
    initialize_deepgram_connection()


if __name__ == "__main__":
    logging.info("Starting SocketIO server.")
    socketio.run(app_socketio, debug=True, allow_unsafe_werkzeug=True, port=5001)
