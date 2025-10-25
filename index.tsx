
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY;

// --- Helper Functions for Audio ---
function decode(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(data, ctx, sampleRate, numChannels) {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


const App = () => {
    const [activeTab, setActiveTab] = useState('help');
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState('');

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                    setLocationError('');
                },
                (error) => {
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            setLocationError("User denied the request for Geolocation.");
                            break;
                        case error.POSITION_UNAVAILABLE:
                            setLocationError("Location information is unavailable.");
                            break;
                        case error.TIMEOUT:
                            setLocationError("The request to get user location timed out.");
                            break;
                        default:
                            setLocationError("An unknown error occurred.");
                            break;
                    }
                }
            );
        } else {
            setLocationError("Geolocation is not supported by this browser.");
        }
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'lens':
                return <MagicLens location={location} />;
            case 'guide':
                return <LocalGuide location={location} />;
            case 'translator':
                return <Translator />;
            case 'help':
                return <Help setActiveTab={setActiveTab} />;
            default:
                return null;
        }
    };

    return (
        <div>
            <header className="header">
                <h1>Mimi‘s tour guide</h1>
                <p>Your AI companion in the heart of Sicilian Baroque</p>
            </header>
            <LocationStatusBar location={location} error={locationError} />
            <div className="tabs">
                <button className={`tab-button ${activeTab === 'lens' ? 'active' : ''}`} onClick={() => setActiveTab('lens')}>
                    <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '4px' }}>photo_camera</span>
                    Magic Lens
                </button>
                <button className={`tab-button ${activeTab === 'guide' ? 'active' : ''}`} onClick={() => setActiveTab('guide')}>
                    <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '4px' }}>chat</span>
                    Local Guide
                </button>
                <button className={`tab-button ${activeTab === 'translator' ? 'active' : ''}`} onClick={() => setActiveTab('translator')}>
                    <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '4px' }}>translate</span>
                    Translator
                </button>
                 <button className={`tab-button ${activeTab === 'help' ? 'active' : ''}`} onClick={() => setActiveTab('help')}>
                    <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '4px' }}>help_outline</span>
                    Help
                </button>
            </div>
            <main className="tab-content">
                {renderContent()}
            </main>
        </div>
    );
};

const LocationStatusBar = ({ location, error }) => {
    if (error) {
        return <div className="location-status-bar error"><span className="material-icons">location_off</span> {error}</div>;
    }
    if (location) {
        return <div className="location-status-bar success"><span className="material-icons">location_on</span> Location available: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</div>;
    }
    return <div className="location-status-bar"><span className="material-icons">location_searching</span> Fetching location...</div>;
};

const MagicLens = ({ location }) => {
    const [image, setImage] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedVoice, setSelectedVoice] = useState('Kore');
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [stylizedImage, setStylizedImage] = useState('');
    const [isGeneratingStylizedImage, setIsGeneratingStylizedImage] = useState(false);


    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const audioContextRef = useRef(null);

    const availableVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(file);
                if (typeof reader.result === 'string') {
                    setImagePreview(reader.result);
                }
                setAnalysis(null);
                setIsBookmarked(false);
                setStylizedImage('');
            };
            reader.readAsDataURL(file);
        }
    };

    const analyzeImage = async () => {
        if (!image) {
            setError('Please upload an image first.');
            return;
        }
        setIsLoading(true);
        setError('');
        setAnalysis(null);
        setIsBookmarked(false);
        setStylizedImage('');

        const reader = new FileReader();
        reader.readAsDataURL(image);
        reader.onload = async () => {
            if (typeof reader.result !== 'string') {
                setError('Failed to read image data.');
                setIsLoading(false);
                return;
            }
            const base64Data = reader.result.split(',')[1];
            const imagePart = {
                inlineData: {
                    mimeType: image.type,
                    data: base64Data
                },
            };
            
            const locationPrompt = location ? `The user is currently at latitude: ${location.latitude}, longitude: ${location.longitude}. Use this information to provide more relevant details if applicable.` : '';
            const prompt = `Based on this image of a place in Scicli, Italy, act as a tour guide named Mimi. Identify the landmark and use search to provide its history, architectural style, and cultural significance. If it's a filming location for Inspector Montalbano, mention that. ${locationPrompt}`;

            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [imagePart, { text: prompt }] },
                    config: { tools: [{ googleSearch: {} }] },
                });
                setAnalysis(response);
                setIsLoading(false);

                // Now, generate the stylized image
                setIsGeneratingStylizedImage(true);
                try {
                    const imageGenPrompt = `Generate a beautiful, artistic, stylized watercolor illustration of the landmark described here: ${response.text}`;
                    const imageResponse = await ai.models.generateContent({
                        model: 'gemini-2.5-flash-image',
                        contents: { parts: [{ text: imageGenPrompt }] },
                        config: {
                            responseModalities: [Modality.IMAGE],
                        },
                    });

                    for (const part of imageResponse.candidates[0].content.parts) {
                        if (part.inlineData) {
                            const base64ImageBytes = part.inlineData.data;
                            const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                            setStylizedImage(imageUrl);
                            break;
                        }
                    }
                } catch (imgErr) {
                    console.error("Stylized image generation failed:", imgErr);
                    // Don't show a user-facing error for this bonus feature, just log it.
                } finally {
                    setIsGeneratingStylizedImage(false);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to analyze the image. Please try again.');
                setIsLoading(false);
            }
        };
    };
    
    const playNarration = async () => {
        if (!analysis || !analysis.text) return;
        setIsLoading(true);
        setError('');
        try {
            const ttsResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: analysis.text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
                    },
                },
            });

            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            const audioContext = audioContextRef.current;
            const outputNode = audioContext.createGain();
            outputNode.connect(audioContext.destination);

            const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                source.start();
            }
        } catch (err) {
            console.error("TTS Error:", err);
            setError("Sorry, could not generate audio at this time.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="card">
            <p>Upload a photo of a landmark in Scicli, and Mimi will tell you all about it!</p>
            <label htmlFor="image-upload" className="button file-upload-label">
                <span className="material-icons">upload_file</span>
                Choose an Image
            </label>
            <input id="image-upload" type="file" accept="image/*" onChange={handleImageChange} />
            <button onClick={analyzeImage} disabled={isLoading || !image} style={{ marginLeft: '10px' }}>
                <span className="material-icons">auto_awesome</span>
                Analyze
            </button>

            {imagePreview && <img src={imagePreview} alt="Preview" className="image-preview" />}
            {isLoading && !analysis && <div className="loader"><div className="dot-flashing"></div></div>}
            {error && <p style={{ color: 'red' }}>{error}</p>}
            
            {analysis && (
                <div className="result-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <h3>Mimi's Analysis</h3>
                         <span className="material-icons" onClick={() => setIsBookmarked(!isBookmarked)} style={{cursor: 'pointer', color: isBookmarked ? 'gold' : 'grey'}}>
                            {isBookmarked ? 'star' : 'star_border'}
                        </span>
                    </div>

                    <p>{analysis.text}</p>
                    
                    <div className="narration-controls">
                        <button onClick={playNarration} disabled={isLoading}>
                            <span className="material-icons">volume_up</span>
                            Read Aloud
                        </button>
                         <div className="voice-radio-group">
                            <span className="voice-label">Voice:</span>
                            {availableVoices.map(voice => (
                                <div key={voice} className="voice-radio-option">
                                    <input
                                        type="radio"
                                        id={`voice-${voice}`}
                                        name="voice"
                                        value={voice}
                                        checked={selectedVoice === voice}
                                        onChange={() => setSelectedVoice(voice)}
                                    />
                                    <label htmlFor={`voice-${voice}`}>{voice}</label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="stylized-image-container">
                        <h3>Mimi's Artistic Impression</h3>
                        {isGeneratingStylizedImage && <div className="loader"><div className="dot-flashing"></div></div>}
                        {stylizedImage && <img src={stylizedImage} alt="Stylized version of the landmark" className="image-preview" />}
                    </div>

                    {analysis.candidates?.[0]?.groundingMetadata?.groundingChunks?.length > 0 && (
                        <div className="grounding-sources">
                            <h3>Sources:</h3>
                            {analysis.candidates[0].groundingMetadata.groundingChunks.map((chunk, index) => (
                                chunk.web && <a key={index} href={chunk.web.uri} target="_blank" rel="noopener noreferrer">{chunk.web.title}</a>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const LocalGuide = ({ location }) => {
    const [chat, setChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef(null);
    const chatWindowRef = useRef(null);
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    useEffect(() => {
        let systemInstruction = "You are Mimi, a friendly and knowledgeable tour guide for Scicli, Sicily, Italy. Answer questions about the town's history, culture, food, and filming locations for Inspector Montalbano. Keep your answers concise and engaging.";
        if (location) {
            systemInstruction += ` The user is currently at latitude: ${location.latitude}, longitude: ${location.longitude}. Use this to provide location-aware suggestions for things to see, do, or eat nearby.`;
        }
        const newChat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: systemInstruction,
                tools: [{ googleSearch: {} }],
            },
        });
        setChat(newChat);
    }, [location]);

    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [messages]);
    
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';
            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setUserInput(transcript);
                handleSendMessage(null, transcript);
            };
            recognitionRef.current.onend = () => {
                setIsRecording(false);
            };
        }
    }, []);

    const handleSendMessage = async (e, text = userInput) => {
        if (e) e.preventDefault();
        if (!text.trim() || !chat) return;

        const userMessage = { role: 'user', text };
        setMessages(prev => [...prev, userMessage]);
        setUserInput('');
        setIsLoading(true);

        try {
            const response = await chat.sendMessage({ message: text });
            const modelMessage = { role: 'model', text: response.text };
            setMessages(prev => [...prev, modelMessage]);
        } catch (error) {
            console.error(error);
            const errorMessage = { role: 'model', text: "Sorry, I'm having trouble connecting. Please try again." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVoiceInput = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
        } else {
            recognitionRef.current?.start();
        }
        setIsRecording(!isRecording);
    };

    return (
        <div className="card">
            <div className="chat-window" ref={chatWindowRef}>
                {messages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.role === 'user' ? 'user-message' : 'model-message'}`}>
                        {msg.text}
                    </div>
                ))}
                {isLoading && <div className="loader"><div className="dot-flashing"></div></div>}
            </div>
            <form className="chat-input-form" onSubmit={handleSendMessage}>
                <input
                    type="text"
                    className="chat-input"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Ask Mimi anything about Scicli..."
                    disabled={isLoading}
                />
                 <button type="button" onClick={handleVoiceInput} className={`button voice-button ${isRecording ? 'recording' : ''}`} disabled={!recognitionRef.current}>
                    <span className="material-icons">{isRecording ? 'mic_off' : 'mic'}</span>
                </button>
                <button type="submit" className="button" disabled={isLoading || !userInput.trim()}>
                    <span className="material-icons">send</span>
                </button>
            </form>
        </div>
    );
};

const Translator = () => {
    const [sourceText, setSourceText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [sourceLang, setSourceLang] = useState('English');
    const [targetLang, setTargetLang] = useState('Italian');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedVoice, setSelectedVoice] = useState('Kore');
    const [context, setContext] = useState('');
    const [autoTranslate, setAutoTranslate] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    
    const recognitionRef = useRef(null);
    const audioContextRef = useRef(null);
    const debounceTimeoutRef = useRef(null);
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const availableVoices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = sourceLang === 'English' ? 'en-US' : 'it-IT';
            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setSourceText(transcript);
                if (autoTranslate) {
                    translateText(transcript);
                }
            };
            recognitionRef.current.onend = () => setIsRecording(false);
        }
    }, [sourceLang, autoTranslate]);


    const translateText = async (textToTranslate = sourceText) => {
        if (!textToTranslate.trim()) return;
        setIsLoading(true);
        setTranslatedText('');

        const contextPrompt = context ? ` Provide the translation in the context of: "${context}".` : '';
        const prompt = `Translate the following text from ${sourceLang} to ${targetLang}. Only return the translated text, without any introductory phrases.${contextPrompt}\n\n${textToTranslate}`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            setTranslatedText(response.text);
        } catch (error) {
            console.error("Translation Error:", error);
            setTranslatedText("Error: Could not translate the text.");
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        if (autoTranslate) {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
            debounceTimeoutRef.current = setTimeout(() => {
                translateText(sourceText);
            }, 1000); // 1-second debounce
        }
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [sourceText, autoTranslate, context]);


    const handleSwapLanguages = () => {
        setSourceLang(targetLang);
        setTargetLang(sourceLang);
        setSourceText(translatedText);
        setTranslatedText(sourceText);
    };

    const handleVoiceInput = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
        } else {
            recognitionRef.current?.start();
        }
        setIsRecording(!isRecording);
    };

    const playTranslatedAudio = async () => {
        if (!translatedText) return;
        setIsLoading(true);
        try {
            const ttsResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: translatedText }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
                    },
                },
            });

            if (!audioContextRef.current) {
                 audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            const audioContext = audioContextRef.current;
            const outputNode = audioContext.createGain();
            outputNode.connect(audioContext.destination);

            const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                source.start();
            }
        } catch (err) {
            console.error("TTS Error:", err);
            setTranslatedText(translatedText + "\n(Could not generate audio)");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="card translator-container">
            <div className="input-area">
                <div className="translator-controls" style={{padding: '0 0 10px 0', justifyContent: 'flex-start'}}>
                    <span className="lang-label">{sourceLang}</span>
                </div>
                <textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder={`Enter text in ${sourceLang}...`}
                />
                <div className="textarea-actions">
                    <button type="button" onClick={handleVoiceInput} className={`button voice-button ${isRecording ? 'recording' : ''}`} disabled={!recognitionRef.current}>
                        <span className="material-icons">{isRecording ? 'mic_off' : 'mic'}</span>
                    </button>
                </div>
            </div>

            <div className="translator-controls">
                <div className="additional-options">
                    <input type="text" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Add context (e.g., food menu)" className="context-input" />
                    <label>
                        <input type="checkbox" checked={autoTranslate} onChange={(e) => setAutoTranslate(e.target.checked)} />
                        Auto-translate as I type
                    </label>
                </div>
                <button onClick={handleSwapLanguages} className="button" title="Swap Languages">
                    <span className="material-icons">swap_horiz</span>
                </button>
                <button onClick={() => translateText()} disabled={isLoading || autoTranslate} className="button">
                    Translate
                </button>
            </div>

            <div className="output-area">
                <div className="translator-controls" style={{padding: '0 0 10px 0', justifyContent: 'flex-start'}}>
                     <span className="lang-label">{targetLang}</span>
                </div>
                <textarea
                    value={isLoading ? 'Translating...' : translatedText}
                    readOnly
                    placeholder={`Translation in ${targetLang}...`}
                />
                 <div className="textarea-actions">
                     <button onClick={playTranslatedAudio} disabled={isLoading || !translatedText} className="button">
                        <span className="material-icons">volume_up</span>
                    </button>
                </div>
            </div>
             <div className="narration-controls" style={{marginTop: '1rem'}}>
                 <div className="voice-selector-container">
                    <label htmlFor="tts-voice" className="voice-label">Voice:</label>
                    <select id="tts-voice" value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="voice-selector">
                        {availableVoices.map(voice => <option key={voice} value={voice}>{voice}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
};

const Help = ({ setActiveTab }) => {
    const [scicliInfo, setScicliInfo] = useState('');
    const [isLoadingInfo, setIsLoadingInfo] = useState(false);
    const [errorInfo, setErrorInfo] = useState('');
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const getScicliInfo = async () => {
        setIsLoadingInfo(true);
        setErrorInfo('');
        setScicliInfo(''); // Clear previous info
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: "Provide a brief and engaging overview of Scicli, Italy, for a tourist. Highlight its history, its significance as a UNESCO World Heritage site for Baroque architecture, and its connection to Inspector Montalbano.",
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });
            setScicliInfo(response.text);
        } catch (err) {
            console.error("Failed to fetch Scicli info:", err);
            setErrorInfo("Sorry, I couldn't fetch information about Scicli right now. Please try again later.");
        } finally {
            setIsLoadingInfo(false);
        }
    };

    return (
        <div className="card help-guide">
            <div className="help-message model-message">
                <span className="material-icons help-icon">waving_hand</span>
                <div className="help-text">
                    <h3>Ciao! I'm Mimi!</h3>
                    <p>I'm your personal guide to the beautiful town of Scicli. Let me show you how I can help make your visit unforgettable!</p>
                </div>
            </div>

            <div className="help-message model-message">
                 <span className="material-icons help-icon">photo_camera</span>
                 <div className="help-text">
                    <h3>Magic Lens</h3>
                    <p>See a beautiful building but don't know what it is? Use the <strong>Magic Lens</strong>! Just upload a photo, and I'll tell you all about its history and secrets.</p>
                    <button className="button" onClick={() => setActiveTab('lens')}>Try Magic Lens</button>
                 </div>
            </div>
            
            <div className="help-message model-message">
                 <span className="material-icons help-icon">chat</span>
                 <div className="help-text">
                    <h3>Local Guide</h3>
                    <p>Have a question? Ask me anything! In the <strong>Local Guide</strong> tab, you can chat with me about the best places to eat, find filming locations from 'Inspector Montalbano', or learn about local traditions.</p>
                    <button className="button" onClick={() => setActiveTab('guide')}>Ask a Question</button>
                 </div>
            </div>

            <div className="help-message model-message">
                 <span className="material-icons help-icon">translate</span>
                 <div className="help-text">
                    <h3>Translator</h3>
                    <p>Need help with the language? The <strong>Translator</strong> is here for you. I can translate between English and Italian. You can even use your voice to speak and hear the translation!</p>
                    <button className="button" onClick={() => setActiveTab('translator')}>Translate Now</button>
                 </div>
            </div>

            <div className="help-message model-message">
                 <span className="material-icons help-icon">info_outline</span>
                 <div className="help-text">
                    <h3>A Glimpse of Scicli</h3>
                    <p>Curious about the town itself? Click the button below for a quick introduction to Scicli's history and significance.</p>
                    <button className="button" onClick={getScicliInfo} disabled={isLoadingInfo}>
                        {isLoadingInfo ? 'Loading...' : 'Tell Me About Scicli'}
                    </button>
                    {isLoadingInfo && <div className="loader" style={{paddingTop: '1rem', justifyContent: 'flex-start'}}><div className="dot-flashing"></div></div>}
                    {errorInfo && <p style={{ color: 'red', marginTop: '1rem' }}>{errorInfo}</p>}
                    {scicliInfo && (
                        <div className="result-container" style={{paddingTop: '1rem', marginTop: 0}}>
                            <p>{scicliInfo}</p>
                        </div>
                    )}
                 </div>
            </div>
            
            <div className="help-message model-message">
                 <span className="material-icons help-icon">explore</span>
                 <div className="help-text">
                    <p>I hope this helps! Feel free to explore all my features and have a wonderful time in Scicli!</p>
                 </div>
            </div>
        </div>
    );
};


const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);