# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Environment Setup
```bash
# Install dependencies with Poetry (preferred)
poetry install

# Or with pip
pip install -r requirements.txt

# Set up environment variables
cp sample.env .env
# Edit .env with your DEEPGRAM_API_KEY
```

### Running the Application
```bash
# Run with Poetry
poetry run python app.py

# Or directly
python app.py
```
The application runs on port 8001 at http://127.0.0.1:8001

### Testing
```bash
pytest tests/
# Run specific test
pytest tests/test_deepgram_sdk.py -v
```

## Architecture Overview

This is a Flask-based real-time speech-to-text application using Deepgram's API with two main transcription modes:

### Core Components

**Flask Application (`app.py`)**
- Main Flask server with SocketIO for WebSocket communication
- Handles live transcription via Deepgram's WebSocket API
- Manages audio streaming from client to Deepgram
- Supports file upload for batch processing

**Audio Processing Modules**
- `common/batch_audio.py`: Processes uploaded audio files via Deepgram REST API
- `common/audio_settings.py`: Detects system audio device capabilities using sounddevice

**Configuration**
- `config/defaults.json`: Default Deepgram transcription parameters
- Environment variables via `.env` file

### Key Workflows

**Live Transcription Flow**
1. Client connects via SocketIO
2. Audio settings detected and configured
3. Deepgram WebSocket connection established with live options
4. Audio stream sent to Deepgram via `audio_stream` event
5. Real-time transcripts returned via `transcription_update` events

**Batch Processing Flow**
1. File uploaded via `upload_file` SocketIO event
2. File saved temporarily and processed via `process_audio()`
3. Deepgram REST API called with configuration parameters
4. Results returned and temporary file cleaned up

### Dependencies
- **deepgram-sdk**: Official Deepgram Python SDK for live and batch transcription
- **flask-socketio**: WebSocket support for real-time communication
- **sounddevice**: Audio device detection and configuration
- **pandas**: Data processing for batch results tracking

## Environment Requirements
- Python 3.12+
- DEEPGRAM_API_KEY environment variable required
- Audio device access for live transcription features