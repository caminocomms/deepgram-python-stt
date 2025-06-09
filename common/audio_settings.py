import logging
import sounddevice as sd
import numpy as np
from flask_socketio import SocketIO

logger = logging.getLogger("AudioSettings")

def detect_audio_settings(socketio=None):
    """
    Detect audio device settings including sample rate and encoding format.
    
    Args:
        socketio: Optional SocketIO instance to emit results in real-time
        
    Returns:
        dict: Dictionary containing audio settings information
    """
    settings = {}
    
    try:
        # Get default device information
        default_device = sd.query_devices(sd.default.device[0], 'input')
        settings['device_name'] = default_device['name']
        settings['sample_rate'] = default_device['default_samplerate']
        settings['max_input_channels'] = default_device['max_input_channels']
        
        logger.info(f"Microphone device: {settings['device_name']}")
        logger.info(f"Sample rate: {settings['sample_rate']}")
        logger.info(f"Max input channels: {settings['max_input_channels']}")
        
        # Capture a short audio sample to determine encoding
        audio_data = None
        
        def audio_callback(indata, frames, time, status):
            nonlocal audio_data
            audio_data = indata.copy()
            raise sd.CallbackStop()
        
        # Open a short stream to capture audio format
        with sd.InputStream(callback=audio_callback, channels=1):
            sd.sleep(500)  # Just need a short sample
        
        if audio_data is not None:
            settings['dtype'] = str(audio_data.dtype)
            settings['bit_depth'] = 8 * audio_data.dtype.itemsize
            settings['shape'] = audio_data.shape
            
            # Calculate bitrate
            bytes_per_sample = audio_data.dtype.itemsize
            channels = audio_data.shape[1] if len(audio_data.shape) > 1 else 1
            bitrate = int(settings['sample_rate'] * bytes_per_sample * 8 * channels)
            settings['bitrate'] = bitrate
            
            logger.info(f"Audio dtype (encoding): {settings['dtype']}")
            logger.info(f"Audio bit depth: {settings['bit_depth']} bits")
            logger.info(f"Audio bitrate: {bitrate} bits/sec")
            
            # If socketio is provided, emit the results
            if socketio:
                socketio.emit('audio_settings', settings)
        
    except Exception as e:
        error_msg = f"Error detecting audio settings: {str(e)}"
        logger.warning(error_msg)
        settings['error'] = error_msg
        
        # If socketio is provided, emit the error
        if socketio:
            socketio.emit('audio_settings', {'error': error_msg})
    
    return settings
