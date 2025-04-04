let isRecording = false;
let socket;
let microphone;
let audioContext;
let processor;
// Track which parameters have been changed during this session
let changedParams = new Set();
// Track if we're in a post-import state
let isImported = false;

let DEFAULT_CONFIG = {
    "base_url": "api.deepgram.com",
    "model": "nova-3",
    "language": "en",
    "utterance_end_ms": "1000",
    "endpointing": "10",
    "smart_format": false,
    "interim_results": true,
    "no_delay": false,
    "dictation": false,
    "numerals": false,
    "profanity_filter": false,
    "redact": false,
    "extra": {}
};

const socket_port = 5001;
socket = io(
  "http://" + window.location.hostname + ":" + socket_port.toString()
);

// Fetch default configuration
fetch('../config/defaults.json')
  .then(response => response.json())
  .then(config => {
    DEFAULT_CONFIG = config;
    // Initialize URL with current config
    updateRequestUrl(getConfig());
  })
  .catch(error => {
    console.error('Error loading default configuration:', error);
    // Initialize URL with current config
    updateRequestUrl(getConfig());
  });

function setDefaultValues() {
    if (!DEFAULT_CONFIG) return;
    
    // Set text input defaults
    ['baseUrl', 'model', 'language', 'utterance_end_ms', 'endpointing'].forEach(id => {
        const element = document.getElementById(id);
        if (element && DEFAULT_CONFIG[id]) {
            element.value = DEFAULT_CONFIG[id];
        }
    });

    // Set checkbox defaults
    ['smart_format', 'interim_results', 'no_delay', 'dictation', 
     'numerals', 'profanity_filter', 'redact'].forEach(id => {
        const element = document.getElementById(id);
        if (element && DEFAULT_CONFIG[id] !== undefined) {
            element.checked = DEFAULT_CONFIG[id];
        }
    });

    // Set extra params default
    document.getElementById('extraParams').value = JSON.stringify(DEFAULT_CONFIG.extra || {}, null, 2);
}

function resetConfig() {
    if (!DEFAULT_CONFIG) return;
    // Clear changed parameters tracking and import state
    changedParams.clear();
    isImported = false;
    setDefaultValues();
    updateRequestUrl(getConfig());
}

function importConfig(input) {
    if (!DEFAULT_CONFIG) return;
    
    // Reset all options to defaults first
    setDefaultValues();
    
    let config;
    
    try {
        config = JSON.parse(input);
    } catch (e) {
        config = parseUrlParams(input);
    }
    
    if (!config) {
        throw new Error('Invalid configuration format. Please provide a valid JSON object or URL.');
    }

    // Set import state
    isImported = true;

    // Mark all parameters as changed during import, regardless of their values
    ['baseUrl', 'model', 'language', 'utterance_end_ms', 'endpointing'].forEach(id => {
        if (config[id]) {
            changedParams.add(id);
        }
    });

    ['smart_format', 'interim_results', 'no_delay', 'dictation', 
     'numerals', 'profanity_filter', 'redact'].forEach(id => {
        if (config[id] !== undefined) {
            changedParams.add(id);
        }
    });

    // Update text inputs
    ['baseUrl', 'model', 'language', 'utterance_end_ms', 'endpointing'].forEach(id => {
        const element = document.getElementById(id);
        if (element && config[id]) {
            element.value = config[id];
        }
    });

    // Update checkboxes
    ['smart_format', 'interim_results', 'no_delay', 'dictation', 
     'numerals', 'profanity_filter', 'redact'].forEach(id => {
        const element = document.getElementById(id);
        if (element && config[id] !== undefined) {
            element.checked = config[id];
        }
    });

    // Update extra params if present
    const extraParams = document.getElementById('extraParams');
    const extra = {};
    Object.keys(config).forEach(key => {
        if (!document.getElementById(key)) {
            extra[key] = config[key];
        }
    });
    if (Object.keys(extra).length > 0) {
        extraParams.value = JSON.stringify(extra, null, 2);
        // Expand extra params section
        const header = document.querySelector('.extra-params-header');
        const content = document.getElementById('extraParamsContent');
        header.classList.remove('collapsed');
        content.classList.remove('collapsed');
    }

    // Update the URL display with import mode
    updateRequestUrl(getConfig(), true);
}

socket.on("transcription_update", (data) => {
  const interimCaptions = document.getElementById("captions");
  const finalCaptions = document.getElementById("finalCaptions");
  
  let timeString = "";
  if (data.timing) {
    const start = data.timing.start.toFixed(2);
    const end = data.timing.end.toFixed(2);
    timeString = `${start}-${end}`;
  }
  
  // Create interim message div
  const interimDiv = document.createElement("div");
  const type = data.is_final ? "[Is Final]" : data.utterance_end ? "[Utterance End]" : "[Interim Result]";
  interimDiv.textContent = data.utterance_end ? 
    `${type} ${data.transcription}` :
    `${timeString}   ${type} ${data.transcription}`;
  interimDiv.className = data.is_final ? "final" : "interim";
  
  // Add to interim container
  interimCaptions.appendChild(interimDiv);
  interimDiv.scrollIntoView({ behavior: "smooth" });
  
  // Update final container
  if (data.is_final) {
    // Remove any existing interim span
    const existingInterim = finalCaptions.querySelector('.interim-final');
    if (existingInterim) {
      existingInterim.remove();
    }
    // For final results, append as a new span
    const finalDiv = document.createElement("span");
    finalDiv.textContent = data.transcription + " ";
    finalDiv.className = "final";
    finalCaptions.appendChild(finalDiv);
    finalDiv.scrollIntoView({ behavior: "smooth" });
  } else if (!data.utterance_end) {
    // For interim results, update or create the interim span
    let interimSpan = finalCaptions.querySelector('.interim-final');
    if (!interimSpan) {
      interimSpan = document.createElement("span");
      interimSpan.className = "interim-final";
      finalCaptions.appendChild(interimSpan);
    }
    interimSpan.textContent = data.transcription + " ";
    interimSpan.scrollIntoView({ behavior: "smooth" });
  }
});

async function getMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new MediaRecorder(stream, { mimeType: "audio/webm" });
  } catch (error) {
    console.error("Error accessing microphone:", error);
    throw error;
  }
}

async function openMicrophone(microphone, socket) {
  return new Promise((resolve) => {
    microphone.onstart = () => {
      console.log("Client: Microphone opened");
      document.body.classList.add("recording");
      resolve();
    };
    microphone.ondataavailable = async (event) => {
      console.log("client: microphone data received");
      if (event.data.size > 0) {
        socket.emit("audio_stream", event.data);
      }
    };
    microphone.start(1000);
  });
}

async function startRecording() {
  isRecording = true;
  microphone = await getMicrophone();
  console.log("Client: Waiting to open microphone");
  
  // Send configuration before starting microphone
  const config = getConfig();
  socket.emit("toggle_transcription", { action: "start", config: config });
  
  // Display the URL in the interim results container
  const interimCaptions = document.getElementById("captions");
  const urlDiv = document.createElement("div");
  urlDiv.className = "url-info";
  const url = document.getElementById('requestUrl').textContent
    .replace(/\s+/g, '') // Remove all whitespace including newlines
    .replace(/&amp;/g, '&'); // Fix any HTML-encoded ampersands
  urlDiv.textContent = `Using URL: ${url}`;
  interimCaptions.appendChild(urlDiv);
  urlDiv.scrollIntoView({ behavior: "smooth" });
  
  await openMicrophone(microphone, socket);
}

async function stopRecording() {
  if (isRecording === true) {
    microphone.stop();
    microphone.stream.getTracks().forEach((track) => track.stop()); // Stop all tracks
    socket.emit("toggle_transcription", { action: "stop" });
    microphone = null;
    isRecording = false;
    console.log("Client: Microphone closed");
    document.body.classList.remove("recording");
  }
}

function getConfig() {
    const config = {
        base_url: document.getElementById('baseUrl').value,
        model: document.getElementById('model').value,
        utterance_end_ms: document.getElementById('utterance_end_ms').value,
        endpointing: document.getElementById('endpointing').value,
        smart_format: document.getElementById('smart_format').checked,
        interim_results: document.getElementById('interim_results').checked,
        no_delay: document.getElementById('no_delay').checked,
        dictation: document.getElementById('dictation').checked,
        numerals: document.getElementById('numerals').checked,
        profanity_filter: document.getElementById('profanity_filter').checked,
        redact: document.getElementById('redact').checked,
        extra: JSON.parse(document.getElementById('extraParams').value || '{}')
    };

    // Only add language if it has a value
    const language = document.getElementById('language').value;
    if (language && language !== 'undefined') {
        config.language = language;
    }

    return config;
}

function toggleConfig() {
    const header = document.querySelector('.config-header');
    const content = document.getElementById('configContent');
    header.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}

function updateRequestUrl(config, forceShowAll = false) {
    const urlElement = document.getElementById('requestUrl');
    const urlText = urlElement.textContent;
    const currentBaseUrl = urlText.split('?')[0];
    const newBaseUrl = `ws://${document.getElementById('baseUrl').value}/v1/listen`;
    const hasBaseUrlChanged = currentBaseUrl !== newBaseUrl;
    
    const baseUrlDisplay = hasBaseUrlChanged ? 
        `<span class="highlight-change">${newBaseUrl}</span>` : 
        newBaseUrl;
    
    const params = new URLSearchParams();
    
    // Get previous params for highlighting changes
    const paramsText = urlText.split('?')[1] || '';
    const prevParams = new URLSearchParams(
        paramsText
            .replace(/\n/g, '')
            .replace(/&$/, '')
    );
    
    // Store line break positions only if not forcing all params
    const lineStartParams = new Set();
    if (!forceShowAll) {
        const existingLines = urlText.split('\n');
        if (existingLines.length > 1) {
            for (let i = 1; i < existingLines.length; i++) {
                const lineParams = existingLines[i].split('&');
                if (lineParams[0]) {
                    const paramName = lineParams[0].split('=')[0];
                    lineStartParams.add(paramName);
                }
            }
        }
    }
    
    // Map snake_case params to camelCase config keys
    const paramMapping = {
        'model': 'model',
        'language': 'language',
        'utterance_end_ms': 'utterance_end_ms',
        'endpointing': 'endpointing',
        'smart_format': 'smart_format',
        'interim_results': 'interim_results',
        'no_delay': 'no_delay',
        'dictation': 'dictation',
        'numerals': 'numerals',
        'profanity_filter': 'profanity_filter',
        'redact': 'redact'
    };
    
    // Add parameters
    Object.entries(paramMapping).forEach(([paramName, configKey]) => {
        const hasBeenChanged = changedParams.has(configKey);
        const isDifferentFromDefault = config[configKey] !== DEFAULT_CONFIG[configKey];
        const value = config[configKey];
        // Skip empty or undefined values, except for interim_results
        if (value === undefined || value === '' || value === 'undefined') {
            return;
        }
        // Always include interim_results, otherwise use normal logic
        if (paramName === 'interim_results' || forceShowAll || isImported || hasBeenChanged || isDifferentFromDefault) {
            params.append(paramName, value);
        }
    });
    
    // Add extra parameters if any
    const extra = config.extra;
    if (Object.keys(extra).length > 0) {
        for (const [key, value] of Object.entries(extra)) {
            if (Array.isArray(value)) {
                // If value is an array, add each value as a separate parameter
                value.forEach(v => params.append(key, v));
            } else if (typeof value === 'object' && value !== null) {
                // If value is an object, stringify it
                params.append(key, JSON.stringify(value));
            } else {
                // For primitive values, add directly
                params.append(key, value);
            }
        }
    }
    
    // Calculate maxLineLength for new parameters
    const containerWidth = urlElement.parentElement.getBoundingClientRect().width;
    const avgCharWidth = 8.5;
    const safetyMargin = 40;
    const maxLineLength = Math.floor((containerWidth - safetyMargin) / avgCharWidth);
    
    // Format URL with line breaks
    const pairs = params.toString().split('&');
    let currentLine = baseUrlDisplay + '?';
    const outputLines = [];
    
    pairs.forEach((pair, index) => {
        const [key, value] = pair.split('=');
        const prevValue = prevParams.get(key);
        const hasChanged = prevValue !== null && prevValue !== value;
        const formattedPair = hasChanged ? `<span class="highlight-change">${pair}</span>` : pair;
        
        // Use simpler line wrapping for imports
        const shouldBreakLine = currentLine !== baseUrlDisplay + '?' && 
            ((!forceShowAll && lineStartParams.has(key)) || 
             (currentLine.length + pair.length + 1 > maxLineLength));
        
        if (shouldBreakLine) {
            outputLines.push(currentLine + '&');
            currentLine = formattedPair;
        } else {
            currentLine += (currentLine === baseUrlDisplay + '?' ? '' : '&') + formattedPair;
        }
        
        if (index === pairs.length - 1) {
            outputLines.push(currentLine);
        }
    });
    
    urlElement.innerHTML = outputLines.join('\n');
}

function toggleExtraParams() {
    const header = document.querySelector('.extra-params-header');
    const content = document.getElementById('extraParamsContent');
    header.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}

function parseUrlParams(url) {
    try {
        // Handle ws:// and wss:// protocols by temporarily replacing them
        let modifiedUrl = url;
        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            modifiedUrl = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
        }
        
        // If URL starts with a path, prepend the default base URL
        if (url.startsWith('/')) {
            modifiedUrl = 'http://api.deepgram.com' + url;
        }
        
        const urlObj = new URL(modifiedUrl);
        const params = {};

        // Extract the hostname as baseUrl, removing /v1/listen if present
        params.baseUrl = urlObj.hostname;
        
        // Clean up the search params (remove whitespace and empty parameters)
        const paramMap = new Map(); // Use Map to handle array parameters
        urlObj.searchParams.forEach((value, key) => {
            const cleanKey = key.trim();
            const cleanValue = value.trim();
            if (cleanKey && cleanValue) {
                // Convert string booleans to actual booleans
                if (cleanValue.toLowerCase() === 'true') {
                    if (paramMap.has(cleanKey)) {
                        // If key exists, convert to array
                        const existingValue = paramMap.get(cleanKey);
                        paramMap.set(cleanKey, Array.isArray(existingValue) ? [...existingValue, true] : [existingValue, true]);
                    } else {
                        paramMap.set(cleanKey, true);
                    }
                } else if (cleanValue.toLowerCase() === 'false') {
                    if (paramMap.has(cleanKey)) {
                        const existingValue = paramMap.get(cleanKey);
                        paramMap.set(cleanKey, Array.isArray(existingValue) ? [...existingValue, false] : [existingValue, false]);
                    } else {
                        paramMap.set(cleanKey, false);
                    }
                } else {
                    if (paramMap.has(cleanKey)) {
                        const existingValue = paramMap.get(cleanKey);
                        paramMap.set(cleanKey, Array.isArray(existingValue) ? [...existingValue, cleanValue] : [existingValue, cleanValue]);
                    } else {
                        paramMap.set(cleanKey, cleanValue);
                    }
                }
            }
        });
        
        // Convert Map to object
        paramMap.forEach((value, key) => {
            params[key] = value;
        });
        
        return params;
    } catch (e) {
        console.error('Invalid URL:', e);
        return null;
    }
}

function simplifyUrl() {
    // Clear import state and changed params
    isImported = false;
    changedParams.clear();
    // Update URL to show only non-default params
    updateRequestUrl(getConfig());
}

document.addEventListener("DOMContentLoaded", () => {
    const recordButton = document.getElementById("record");
    const configPanel = document.querySelector('.config-panel');
    const copyButton = document.getElementById('copyUrl');
    const resetButton = document.getElementById('resetButton');
    const simplifyButton = document.getElementById('simplifyButton');
    const clearButton = document.getElementById('clearButton');
    
    // Make URL editable
    const urlElement = document.getElementById('requestUrl');
    urlElement.contentEditable = true;
    urlElement.style.cursor = 'text';
    
    // Clear button functionality
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            document.getElementById('captions').innerHTML = '';
            document.getElementById('finalCaptions').innerHTML = '';
        });
    }
    
    // Reset button functionality
    if (resetButton) {
        resetButton.addEventListener('click', resetConfig);
    }
    
    // Simplify button functionality
    if (simplifyButton) {
        simplifyButton.addEventListener('click', simplifyUrl);
    }
    
    // Copy URL functionality
    copyButton.addEventListener('click', () => {
        const url = document.getElementById('requestUrl').textContent
            .replace(/\s+/g, '') // Remove all whitespace including newlines
            .replace(/&amp;/g, '&'); // Fix any HTML-encoded ampersands
        navigator.clipboard.writeText(url).then(() => {
            copyButton.classList.add('copied');
            setTimeout(() => copyButton.classList.remove('copied'), 1000);
        });
    });

    // Add event listeners to all config inputs with change tracking
    const configInputs = document.querySelectorAll('#configForm input');
    configInputs.forEach(input => {
        input.addEventListener('change', () => {
            changedParams.add(input.id);
            updateRequestUrl(getConfig());
        });
        if (input.type === 'text') {
            input.addEventListener('input', () => {
                changedParams.add(input.id);
                updateRequestUrl(getConfig());
            });
        }
    });
    
    // Add event listener for extra params
    document.getElementById('extraParams').addEventListener('input', () => {
        try {
            const extraParams = document.getElementById('extraParams');
            const rawJson = extraParams.value || '{}';
            // Parse the raw JSON string to handle duplicate keys
            const processedExtra = {};
            const lines = rawJson.split('\n');
            lines.forEach(line => {
                const match = line.match(/"([^"]+)":\s*"([^"]+)"/);
                if (match) {
                    const [, key, value] = match;
                    if (processedExtra[key]) {
                        if (Array.isArray(processedExtra[key])) {
                            processedExtra[key].push(value);
                        } else {
                            processedExtra[key] = [processedExtra[key], value];
                        }
                    } else {
                        processedExtra[key] = value;
                    }
                }
            });
            // Update the textarea with the processed JSON
            extraParams.value = JSON.stringify(processedExtra, null, 2);
            // Mark extra params as changed if they're not empty
            if (Object.keys(processedExtra).length > 0) {
                changedParams.add('extraParams');
            } else {
                changedParams.delete('extraParams');
            }
            updateRequestUrl(getConfig());
        } catch (e) {
            console.warn('Invalid JSON in extra params');
        }
    });

    // Add resize listener to update URL formatting when window size changes
    window.addEventListener('resize', () => {
        updateRequestUrl(getConfig());
    });

    // Initialize URL with current config instead of defaults
    updateRequestUrl(getConfig());

    recordButton.addEventListener("change", async () => {
        if (recordButton.checked) {
            try {
                await startRecording();
            } catch (error) {
                console.error("Failed to start recording:", error);
                recordButton.checked = false;
            }
        } else {
            await stopRecording();
        }
    });

    // Initialize extra params as collapsed
    const extraParamsHeader = document.querySelector('.extra-params-header');
    extraParamsHeader.classList.add('collapsed');

    // Add import button handler
    document.getElementById('importButton').addEventListener('click', () => {
        const importInput = document.getElementById('importInput');
        const input = importInput.value.trim();
        if (!input) {
            alert('Please enter a configuration to import.');
            return;
        }
        
        try {
            importConfig(input);
            // Only clear input if import was successful
            importInput.value = '';
        } catch (e) {
            alert('Invalid configuration format. Please provide a valid JSON object or URL.');
        }
    });

    // Add keyboard shortcut (Enter key) for import input
    document.getElementById('importInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('importButton').click();
        }
    });

    // Add event listener for URL editing
    document.getElementById('requestUrl').addEventListener('input', function(e) {
        // Store cursor position
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const cursorOffset = range.startOffset;
        
        const url = this.textContent.replace(/\s+/g, '').replace(/&amp;/g, '&');
        const config = parseUrlParams(url);
        if (config) {
            // Update form fields based on URL
            Object.entries(config).forEach(([key, value]) => {
                const element = document.getElementById(key);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = value;
                    } else {
                        element.value = value;
                    }
                    changedParams.add(key);
                }
            });
            
            // Update extra parameters
            const extraParams = {};
            Object.entries(config).forEach(([key, value]) => {
                if (!document.getElementById(key)) {
                    extraParams[key] = value;
                }
            });
            document.getElementById('extraParams').value = JSON.stringify(extraParams, null, 2);
            
            // Update URL display without resetting to defaults
            const urlElement = document.getElementById('requestUrl');
            urlElement.innerHTML = url;
            
            // Restore cursor position
            try {
                const newRange = document.createRange();
                newRange.setStart(urlElement.firstChild || urlElement, Math.min(cursorOffset, (urlElement.firstChild || urlElement).length));
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } catch (e) {
                console.warn('Could not restore cursor position:', e);
            }
        }
    });
});
