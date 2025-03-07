let isRecording = false;
let socket;
let microphone;
let audioContext;
let processor;

const socket_port = 5001;
socket = io(
  "http://" + window.location.hostname + ":" + socket_port.toString()
);

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
        language: document.getElementById('language').value,
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

    return config;
}

function toggleConfig() {
    const header = document.querySelector('.config-header');
    const content = document.getElementById('configContent');
    header.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}

function updateRequestUrl(config) {
    const urlElement = document.getElementById('requestUrl');
    const urlText = urlElement.textContent;
    const currentBaseUrl = urlText.split('?')[0];
    const newBaseUrl = `ws://${document.getElementById('baseUrl').value}/v1/listen`;
    const hasBaseUrlChanged = currentBaseUrl !== newBaseUrl;
    
    const baseUrlDisplay = hasBaseUrlChanged ? 
        `<span class="highlight-change">${newBaseUrl}</span>` : 
        newBaseUrl;
    
    const params = new URLSearchParams();
    
    // Get previous params and line break positions
    const paramsText = urlText.split('?')[1] || '';
    const prevParams = new URLSearchParams(
        paramsText
            .replace(/\n/g, '')  // Remove line breaks
            .replace(/&$/, '')   // Remove trailing ampersands
    );
    
    // Store the previous line break positions by finding which parameters started each line
    const existingLines = urlText.split('\n');
    const lineStartParams = new Set();
    if (existingLines.length > 1) {
        for (let i = 1; i < existingLines.length; i++) {
            const lineParams = existingLines[i].split('&');
            if (lineParams[0]) {
                const paramName = lineParams[0].split('=')[0];
                lineStartParams.add(paramName);
            }
        }
    }
    
    // Map snake_case params to camelCase config keys
    const paramMapping = {
        'smart_format': 'smart_format',
        'interim_results': 'interim_results',
        'no_delay': 'no_delay',
        'dictation': 'dictation',
        'numerals': 'numerals',
        'profanity_filter': 'profanity_filter',
        'redact': 'redact'
    };
    
    // Add boolean parameters
    Object.entries(paramMapping).forEach(([paramName, configKey]) => {
        params.append(paramName, config[configKey]);
    });
    
    // Add extra parameters if any
    const extra = config.extra;
    for (const [key, value] of Object.entries(extra)) {
        params.append(key, value);
    }
    
    // Calculate maxLineLength for new parameters
    const containerWidth = urlElement.parentElement.getBoundingClientRect().width;
    const avgCharWidth = 8.5;
    const safetyMargin = 40;
    const maxLineLength = Math.floor((containerWidth - safetyMargin) / avgCharWidth);
    
    // Format URL with intelligent line breaks and highlighting
    const pairs = params.toString().split('&');
    let currentLine = baseUrlDisplay + '?';
    const outputLines = [];
    
    pairs.forEach((pair, index) => {
        const [key, value] = pair.split('=');
        const prevValue = prevParams.get(key);
        const hasChanged = prevValue !== null && prevValue !== value;
        const formattedPair = hasChanged ? `<span class="highlight-change">${pair}</span>` : pair;
        
        // Check if this parameter started a new line previously
        const shouldBreakLine = currentLine !== baseUrlDisplay + '?' && 
            (lineStartParams.has(key) || 
             (currentLine.length + pair.length + 1 > maxLineLength && !lineStartParams.size));
        
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

function resetConfig() {
    // Reset all options to defaults
    document.getElementById('baseUrl').value = 'api.deepgram.com';
    document.getElementById('model').value = 'nova-3';
    document.getElementById('language').value = 'en';
    document.getElementById('utterance_end_ms').value = '1000';
    document.getElementById('endpointing').value = '10';
    document.getElementById('smart_format').checked = false;
    document.getElementById('interim_results').checked = false;
    document.getElementById('no_delay').checked = false;
    document.getElementById('dictation').checked = false;
    document.getElementById('numerals').checked = false;
    document.getElementById('profanity_filter').checked = false;
    document.getElementById('redact').checked = false;
    document.getElementById('extraParams').value = '{}';
    
    // Update the URL display
    updateRequestUrl(getConfig());
}

function parseUrlParams(url) {
    try {
        // Handle ws:// and wss:// protocols by temporarily replacing them
        let modifiedUrl = url;
        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            modifiedUrl = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
        }
        
        const urlObj = new URL(modifiedUrl);
        const params = {};

        // Extract the hostname as baseUrl, removing /v1/listen if present
        params.baseUrl = urlObj.hostname + (urlObj.pathname === '/v1/listen' ? '' : urlObj.pathname);
        
        // Clean up the search params (remove whitespace and empty parameters)
        urlObj.searchParams.forEach((value, key) => {
            const cleanKey = key.trim();
            const cleanValue = value.trim();
            if (cleanKey && cleanValue) {
                // Convert string booleans to actual booleans
                if (cleanValue.toLowerCase() === 'true') {
                    params[cleanKey] = true;
                } else if (cleanValue.toLowerCase() === 'false') {
                    params[cleanKey] = false;
                } else {
                    params[cleanKey] = cleanValue;
                }
            }
        });
        
        return params;
    } catch (e) {
        console.error('Invalid URL:', e);
        return null;
    }
}

function importConfig(input) {
    // Reset all options to defaults first
    document.getElementById('baseUrl').value = 'api.deepgram.com';
    document.getElementById('model').value = 'nova-3';
    document.getElementById('language').value = 'en';
    document.getElementById('utterance_end_ms').value = '1000';
    document.getElementById('endpointing').value = '10';
    document.getElementById('smart_format').checked = false;
    document.getElementById('interim_results').checked = false;
    document.getElementById('no_delay').checked = false;
    document.getElementById('dictation').checked = false;
    document.getElementById('numerals').checked = false;
    document.getElementById('profanity_filter').checked = false;
    document.getElementById('redact').checked = false;
    document.getElementById('extraParams').value = '{}';

    let config;
    
    // Try parsing as JSON first
    try {
        config = JSON.parse(input);
    } catch (e) {
        // If not JSON, try parsing as URL
        config = parseUrlParams(input);
    }
    
    if (!config) {
        throw new Error('Invalid configuration format. Please provide a valid JSON object or URL.');
    }

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

    // Update the URL display
    updateRequestUrl(getConfig());
}

document.addEventListener("DOMContentLoaded", () => {
  const recordButton = document.getElementById("record");
  const configPanel = document.querySelector('.config-panel');
  const copyButton = document.getElementById('copyUrl');
  const resetButton = document.getElementById('resetButton');
  
  // Reset button functionality
  if (resetButton) {
    resetButton.addEventListener('click', resetConfig);
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

  // Add event listeners to all config inputs
  const configInputs = document.querySelectorAll('#configForm input');
  configInputs.forEach(input => {
    input.addEventListener('change', () => updateRequestUrl(getConfig()));
    if (input.type === 'text') {
      input.addEventListener('input', () => updateRequestUrl(getConfig()));
    }
  });
  
  // Add event listener for extra params
  document.getElementById('extraParams').addEventListener('input', () => {
    try {
      JSON.parse(document.getElementById('extraParams').value || '{}');
      updateRequestUrl(getConfig());
    } catch (e) {
      console.warn('Invalid JSON in extra params');
    }
  });

  // Add resize listener to update URL formatting when window size changes
  window.addEventListener('resize', () => {
    updateRequestUrl(getConfig());
  });

  // Initialize URL with default config
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
});
