# Flask Live Transcription Starter

Get started using Deepgram's Live Transcription with this Flask demo app.

## What is Deepgram?

[Deepgram](https://deepgram.com/) is a foundational AI company providing speech-to-text and language understanding capabilities to make data readable and actionable by human or machines.

## Sign-up to Deepgram

Before you start, it's essential to generate a Deepgram API key to use in this project. [Sign-up now for Deepgram and create an API key](https://console.deepgram.com/signup?jump=keys).

## Quickstart

### Manual

Follow these steps to get started with this starter application.

#### Clone the repository

Go to GitHub and [clone the repository](https://github.com/Jacob-Lasky/deepgram-python-stt).

#### Install dependencies

**For Windows Users:**
First ensure you have Python installed. If not, download it from [python.org](https://www.python.org/downloads/windows/) and follow the installation instructions.

**For all platforms:**
Install the project dependencies:

```bash
pip install -r requirements.txt
```

#### Edit the config file

Copy the code from `sample.env` and create a new file called `.env`. Paste in the code and enter your API key you generated in the [Deepgram console](https://console.deepgram.com/).

```js
DEEPGRAM_API_KEY=%api_key%
```

#### Run the application

**For Windows:**
```cmd
python app.py
```

**For Linux/macOS:**
```bash
python app.py
```

The application will start on port 8001. Open your browser and navigate to <http://127.0.0.1:8001> to access the live transcription interface.

## Issue Reporting

If you have found a bug or if you have a feature request, please report them at this repository issues section. Please do not report security vulnerabilities on the public GitHub issue tracker. The [Security Policy](./SECURITY.md) details the procedure for contacting Deepgram.

## Getting Help

We love to hear from you so if you have questions, comments or find a bug in the project, let us know! You can either:

- [Open an issue in this repository](https://github.com/Jacob-Lasky/deepgram-python-stt/issues/new)
- [Join the Deepgram Github Discussions Community](https://github.com/orgs/deepgram/discussions)
- [Join the Deepgram Discord Community](https://discord.gg/xWRaCDBtW4)

## Author

[Deepgram](https://deepgram.com)

## License

This project is licensed under the MIT license. See the [LICENSE](./LICENSE) file for more info.
