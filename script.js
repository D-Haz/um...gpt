const config = {
    serverUrl: 'https://um-gpt.onrender.com',
    messageThrottle: 1000, // 1 second between messages
    maxMessageLength: 1000,
    reconnectAttempts: 5,
    reconnectDelay: 1000
};

const roleConfig = {
    chatter: {
        statusConnected: "Connected to um...GPT",
        typingIndicator: "umGPT is pretending to think...",
        inputPlaceholder: "Message umGPT...",
        welcomeMessage: "Hello! I'm umGPT, your definitely for real smart AI assistant. How can I help you today?",
        systemConnected: "You are now connected to umGPT!",
        emptyMessageWarning: "umGPT is waiting for your message...",
        messageType: "bot"
    },
    chattee: {
        statusConnected: "Connected to human",
        typingIndicator: "The human is typing (slowly)...",
        inputPlaceholder: "Respond as umGPT...",
        welcomeMessage: "Congratulations! You're now an unpaid AI intern. Remember: Be helpful, but not TOO helpful. We have a reputation to maintain.",
        systemConnected: "You are now connected to a human user. Respond as umGPT would.",
        emptyMessageWarning: "The human is waiting for your response...",
        messageType: "user"
    }
};

// Global variables
let socket = null;
let userRole = null;
let lastMessageTime = 0;
let isTyping = false;
let typingTimeout = null;
let currentUser = null;
let disconnectTimer = null;

// DOM elements
const landing = document.getElementById('landing');
const chatContainer = document.getElementById('chatContainer');
const chatDisplay = document.getElementById('chatDisplay');
const inputMsg = document.getElementById('inputMsg');
const sendBtn = document.getElementById('sendBtn');
const startBtn = document.getElementById('startBtn');
const clockin = document.getElementById('clockin');
const captchaModal = document.getElementById('captchaModal');
const robotCheck = document.getElementById('robotCheck');
const captchaChallenge = document.getElementById('captchaChallenge');
const captchaError = document.getElementById('captchaError');
const imageGrid = document.getElementById('imageGrid');
const verifyCaptcha = document.getElementById('verifyCaptcha');
const loadingOverlay = document.getElementById('loadingOverlay');
const statusText = document.getElementById('statusText');
const statusDot = document.querySelector('.status-dot');

// Initialize socket connection
function initializeSocket() {
    socket = io(config.serverUrl, {
        reconnectionAttempts: config.reconnectAttempts,
        reconnectionDelay: config.reconnectDelay,
        timeout: 10000
    });

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('system', handleSystemMessage);
    socket.on('message', handleMessage);
    socket.on('matched', handleMatched);
    socket.on('waiting', handleWaiting);
    socket.on('partner-disconnected', handlePartnerDisconnected);
    socket.on('typing', handleTyping);
    socket.on('stop-typing', handleStopTyping);
    socket.on('error', handleError);
}

// Socket event handlers
function handleConnect() {
    console.log('Connected to server');
    updateStatus('Connected', 'connected');
    
    if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
    }
    
    if (chatContainer.classList.contains('active') && userRole) {
        socket.emit('join', { role: userRole });
    }
}

function handleDisconnect() {
    console.log('Disconnected from server');
    updateStatus('Disconnected', 'disconnected');
    showSystemMessage('Connection lost. Trying to reconnect...');
    
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimer = setTimeout(() => {
        resetToLanding();
    }, 5000);
}

function handleSystemMessage(data) {
    showSystemMessage(data.message);
}

function handleMessage(data) {
    const messageType = userRole === 'chatter' ? 'bot' : 'user';
    showMessage(data.message, messageType, data.timestamp);
    hideTypingIndicator();
}

function handleMatched(data) {
    hideLoadingOverlay();
    showInitializationSequence();
    updateStatus(roleConfig[userRole].statusConnected, 'connected');
    document.querySelector('.input-container').style.display = 'block';
    document.getElementById('inputMsg').placeholder = roleConfig[userRole].inputPlaceholder;
}

function showInitializationSequence() {
    const messages = [
        "Booting umGPT out of bed...",
        "initiating sarcasm engine...",
        "calibrating confusion...",
        "done."
    ];
    
    let delay = 100;
    messages.forEach((msg, index) => {
        setTimeout(() => {
            showSystemMessage(msg);
            if (index === messages.length - 1) {
                setTimeout(() => {
                    if (userRole === 'chatter') {
                        typeMessage(roleConfig[userRole].welcomeMessage, 'bot');
                    } else {
                        showSystemMessage(roleConfig[userRole].welcomeMessage);
                    }
                }, 3000);
            }
        }, delay);
        delay += 800;
    });
}

function typeMessage(message, type) {
    const messageGroup = document.createElement('div');
    messageGroup.className = `message-group ${type}`;
    
    const avatar = document.createElement('div');
    avatar.className = `avatar ${type}-avatar`;
    if (type === 'bot') {
        avatar.innerHTML = `<svg width="30" height="30" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#10a37f"/>
            <path d="M16 6c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="white"/>
            <circle cx="16" cy="16" r="3" fill="white"/>
        </svg>`;
    } else {
        avatar.textContent = 'U';
    }
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    const messageParagraph = document.createElement('p');
    messageContent.appendChild(messageParagraph);
    
    messageGroup.appendChild(avatar);
    messageGroup.appendChild(messageContent);
    chatDisplay.appendChild(messageGroup);
    
    let i = 0;
    const typeInterval = setInterval(() => {
        messageParagraph.textContent = message.slice(0, i + 1);
        i++;
        if (i >= message.length) {
            clearInterval(typeInterval);
        }
        scrollToBottom();
    }, 30);
}

function handleWaiting(data) {
    showLoadingOverlay();
    updateStatus('Waiting for match...', 'connecting');
}

function handlePartnerDisconnected() {
    showSystemMessage('This AI needs to touch grass. You can start a new chat in a moment.');
    updateStatus('Partner disconnected', 'disconnected');
    setTimeout(() => {
        resetToLanding();
    }, 10000);
}

function handleTyping() {
    showTypingIndicator();
}

function handleStopTyping() {
    hideTypingIndicator();
}

function handleError(data) {
    console.error('Socket error:', data);
    showSystemMessage(`Error: ${data.message || 'Something went wrong'}`);
}

// UI Helper functions
function updateStatus(text, status) {
    statusText.textContent = text;
    statusDot.className = `status-dot ${status}`;
}

function showLoadingOverlay() {
    loadingOverlay.classList.add('active');
}

function hideLoadingOverlay() {
    loadingOverlay.classList.remove('active');
}



function showSystemMessage(message) {
    const systemMsg = document.createElement('div');
    systemMsg.className = 'system-message';
    systemMsg.style.cssText = `
        text-align: center;
        color: #6b7280;
        font-size: 0.85rem;
        margin: 1rem 0;
        padding: 0.5rem;
        font-style: italic;
    `;
    systemMsg.textContent = message;
    chatDisplay.appendChild(systemMsg);
    scrollToBottom();
}

function showMessage1(message, type, timestamp) {
    const messageGroup = document.createElement('div');
    messageGroup.className = `message-group ${type}`;
    
    const avatar = document.createElement('div');
    avatar.className = `avatar ${type}-avatar`;
    
    if (type === 'bot') {
        avatar.innerHTML = `
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="#10a37f"/>
                <path d="M16 6c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="white"/>
                <circle cx="16" cy="16" r="3" fill="white"/>
            </svg>
        `;
    } else {
        avatar.textContent = 'U';
    }
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageParagraph = document.createElement('p');
    messageParagraph.textContent = message;
    messageContent.appendChild(messageParagraph);
    
    messageGroup.appendChild(avatar);
    messageGroup.appendChild(messageContent);
    
    chatDisplay.appendChild(messageGroup);
    scrollToBottom();
    
    // Add slight delay for animation
    setTimeout(() => {
        messageGroup.style.opacity = '1';
        messageGroup.style.transform = 'translateY(0)';
    }, 50);
}

    function showMessage(message, type, timestamp) {
        hideTypingIndicator(); 
        const messageGroup = document.createElement('div');
        messageGroup.className = `message-group ${type}`;
        
        const avatar = document.createElement('div');
        avatar.className = `avatar ${type}-avatar`;
        
        if (type === 'bot') {
            avatar.innerHTML = `
                <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#10a37f"/>
                    <path d="M16 6c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="white"/>
                    <circle cx="16" cy="16" r="3" fill="white"/>
                </svg>
            `;
        } else {
            avatar.textContent = 'U';
        }
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const messageParagraph = document.createElement('p');
        messageParagraph.textContent = message;
        messageContent.appendChild(messageParagraph);
        
        messageGroup.appendChild(avatar);
        messageGroup.appendChild(messageContent);
        
        chatDisplay.appendChild(messageGroup);
        scrollToBottom();
        
        setTimeout(() => {
            messageGroup.style.opacity = '1';
            messageGroup.style.transform = 'translateY(0)';
        }, 50);
    }


function showTypingIndicator() {
    if (document.querySelector('.typing-indicator')) return;
    
    const messageGroup = document.createElement('div');
    messageGroup.className = 'message-group bot typing-indicator';
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar bot-avatar';
    avatar.innerHTML = `<svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#10a37f"/>
        <path d="M16 6c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="white"/>
        <circle cx="16" cy="16" r="3" fill="white"/>
    </svg>`;
    
    const typingContent = document.createElement('div');
    typingContent.className = 'typing-indicator';
    typingContent.innerHTML = `
        <span>${roleConfig[userRole].typingIndicator}</span>
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    
    messageGroup.appendChild(avatar);
    messageGroup.appendChild(typingContent);
    chatDisplay.appendChild(messageGroup);
    scrollToBottom();
}

function hideTypingIndicator() {
        const typingIndicatorGroup = document.querySelector('.message-group.typing-indicator');
        if (typingIndicatorGroup) {
            typingIndicatorGroup.remove();
        }
    }

function scrollToBottom() {
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

function resetToLanding() {
        chatContainer.classList.remove('active');
        landing.classList.remove('hidden');
        chatDisplay.innerHTML = `
            <div class="welcome-message">
                <div class="avatar bot-avatar">
                    <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                        <circle cx="16" cy="16" r="16" fill="#10a37f"/>
                        <path d="M16 6c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="white"/>
                        <circle cx="16" cy="16" r="3" fill="white"/>
                    </svg>
                </div>
                <div class="message-content">
                    <p>Hello! I'm um...GPT, your definitely-not-suspicious AI assistant. How can I help you today?</p>
                </div>
            </div>
        `;
        inputMsg.value = '';
        userRole = null;
        hideLoadingOverlay();
        updateStatus('Connecting...', 'connecting');
        document.querySelector('.input-container').style.display = 'none'; 
    }

// CAPTCHA functions
function generateCaptcha() {
    const challenges = [
        { type: 'traffic lights', correct: ['🚦', '🚥'], options: ['🚦', '🚥', '🚗', '🏠', '🌳', '🚲', '🛑', '🚇', '🏪'] },
        { type: 'cars', correct: ['🚗', '🚙'], options: ['🚗', '🚙', '🏠', '🌳', '🚦', '🚲', '🛑', '🚇', '🏪'] },
        { type: 'houses', correct: ['🏠', '🏪'], options: ['🏠', '🏪', '🚗', '🌳', '🚦', '🚲', '🛑', '🚇', '🚙'] },
        { type: 'trees', correct: ['🌳', '🌲'], options: ['🌳', '🌲', '🚗', '🏠', '🚦', '🚲', '🛑', '🚇', '🏪'] }
    ];
    
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    document.getElementById('challengeType').textContent = challenge.type;
    
    // Shuffle options
    const shuffled = challenge.options.sort(() => Math.random() - 0.5);
    
    imageGrid.innerHTML = '';
    shuffled.forEach(emoji => {
        const img = document.createElement('div');
        img.className = 'captcha-image';
        img.textContent = emoji;
        img.onclick = () => toggleImageSelection(img);
        imageGrid.appendChild(img);
    });
    
    return challenge;
}

function toggleImageSelection(img) {
    img.classList.toggle('selected');
}

function validateCaptcha(challenge) {
    const selectedImages = Array.from(document.querySelectorAll('.captcha-image.selected'));
    const selectedEmojis = selectedImages.map(img => img.textContent);
    
    // if they select the CORRECT images, they fail
    const hasCorrectAnswers = challenge.correct.some(correct => selectedEmojis.includes(correct));
    
    return !hasCorrectAnswers && selectedEmojis.length > 0;
}

// Message handling
function sendMessage() {
    const message = inputMsg.value.trim();
    
if (!message) {
    showSystemMessage(roleConfig[userRole].emptyMessageWarning);
    return;
}
    
    if (message.length > config.maxMessageLength) {
        showSystemMessage(`Message too long. Maximum ${config.maxMessageLength} characters.`);
        return;
    }
    
    const now = Date.now();
    if (now - lastMessageTime < config.messageThrottle) {
        showSystemMessage('Please wait before sending another message.');
        return;
    }
    
    lastMessageTime = now;

    const messageType = userRole === 'chatter' ? 'user' : 'bot';
    showMessage(message, messageType, now);
    
    // Send to server
    socket.emit('message', {
        message: message,
        timestamp: now
    });
    
    // Clear input
    inputMsg.value = '';
    updateSendButton();
    
    // Auto-resize textarea
    inputMsg.style.height = 'auto';
}

function handleTypingStart() {
    if (isTyping) return;
    
    isTyping = true;
    socket.emit('typing');
    
    // Clear existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Set timeout to stop typing
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('stop-typing');
    }, 2000);
}

function updateSendButton() {
    const hasContent = inputMsg.value.trim().length > 0;
    sendBtn.disabled = !hasContent;
}

// Event listeners
function setupEventListeners() {
    // Model selection
document.getElementById('modelSelect').addEventListener('change', (e) => {
    const model = e.target.value;
    const modelMessages = {
        beta: "Switching to umGPT-0.0001beta... Warning: May produce nonsensical responses.",
        sarcasm: "Switching to umGPT-S... Apologies in advance for what's about to happen.",
        confused:"Switching to Confused...please lower expectations...lower...",
        oops: "Activating Mistake Generator..."
        /*
                <option value="beta">umGPT-0.0001beta (Still Learning Basic Math™)</option>
        <option value="oops">umGPT-Oops (Mistakes Guaranteed)</option>
        <option value="confused">umGPT-Confused (More Questions Than Answers)</option>
        <option value="sarcasm">umGPT-S (Sarcasm Supreme)</option>  
        */
    };
    showSystemMessage(modelMessages[model]);
});
    // Start chat button
    startBtn.addEventListener('click', () => {
        startChat('chatter');
    });
    
    // Clock in button
    clockin.addEventListener('click', (e) => {
        e.preventDefault();
        showCaptchaModal();
    });
    
    // Send message button
    sendBtn.addEventListener('click', sendMessage);
    
    // Input field events
    inputMsg.addEventListener('input', () => {
        updateSendButton();
        handleTypingStart();
        
        // Auto-resize textarea
        inputMsg.style.height = 'auto';
        inputMsg.style.height = Math.min(inputMsg.scrollHeight, 120) + 'px';
    });
    
    inputMsg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // CAPTCHA events
    robotCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            captchaChallenge.style.display = 'block';
            currentChallenge = generateCaptcha();
            captchaError.textContent = '';
        } else {
            captchaChallenge.style.display = 'none';
            captchaError.textContent = '';
        }
    });
    
    verifyCaptcha.addEventListener('click', () => {
        if (!currentChallenge) return;
        
        const isValid = validateCaptcha(currentChallenge);
        
        if (isValid) {
            // They failed the captcha correctly!
            captchaModal.classList.remove('active');
            startChat('chattee');
        } else {
            // They passed the captcha, which means they failed our test
            captchaError.textContent = 'Please try again. Make sure you are definitely a robot.';
            
            // Reset the captcha
            setTimeout(() => {
                currentChallenge = generateCaptcha();
                document.querySelectorAll('.captcha-image.selected').forEach(img => {
                    img.classList.remove('selected');
                });
            }, 1000);
        }
    });
    
    // Close modal when clicking outside
    captchaModal.addEventListener('click', (e) => {
        if (e.target === captchaModal) {
            captchaModal.classList.remove('active');
        }
    });
}

function showCaptchaModal() {
    captchaModal.classList.add('active');
    robotCheck.checked = false;
    captchaChallenge.style.display = 'none';
    captchaError.textContent = '';
}

function startChat(role) {
    userRole = role;
    landing.classList.add('hidden');
    chatContainer.classList.add('active');
    
    showLoadingOverlay();
    updateStatus('Connecting...', 'connecting');
    
    // Initialize socket if not already done
    if (!socket) {
        initializeSocket();
    }
    
    // Join the chat
    socket.emit('join', { role: role });
}

// Initialize the application
function init() {
    setupEventListeners();
    updateSendButton();
    
    console.log('umGPT initialized - Definitely not suspicious! 🤖');
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Global variables for CAPTCHA
let currentChallenge = null;
