interface Message {
    id: string;
    text: string;
    timestamp: number;
    type: 'sent' | 'received';
}

interface AppSettings {
    recipientName: string;
    profilePicture: string;
    messageLimit: number;
}

class RobustStorage {
    private dbName = 'disparuDB';
    private dbVersion = 1;
    private storeName = 'messages';
    private db: IDBDatabase | null = null;

    async init(): Promise<void> {
        try {
            this.db = await this.openIndexedDB();
        } catch (error) {
            console.warn('IndexedDB not available:', error);
        }
    }

    private openIndexedDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async setItem(key: string, value: string): Promise<void> {
        // Try localStorage first
        if (this.isLocalStorageAvailable()) {
            try {
                localStorage.setItem(key, value);
                return;
            } catch (error) {
                console.warn('localStorage failed, trying IndexedDB:', error);
                // If localStorage quota exceeded, try to clean up
                this.cleanupLocalStorage();
                try {
                    localStorage.setItem(key, value);
                    return;
                } catch (secondError) {
                    console.warn('localStorage cleanup failed:', secondError);
                }
            }
        }

        // Fallback to IndexedDB
        if (this.db) {
            try {
                await this.setItemIndexedDB(key, value);
            } catch (error) {
                console.error('Both localStorage and IndexedDB failed:', error);
                throw error;
            }
        } else {
            throw new Error('No storage method available');
        }
    }

    async getItem(key: string): Promise<string | null> {
        // Try localStorage first
        if (this.isLocalStorageAvailable()) {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                console.warn('localStorage read failed:', error);
            }
        }

        // Fallback to IndexedDB
        if (this.db) {
            try {
                return await this.getItemIndexedDB(key);
            } catch (error) {
                console.warn('IndexedDB read failed:', error);
            }
        }

        return null;
    }

    private setItemIndexedDB(key: string, value: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(value, key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    private getItemIndexedDB(key: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('IndexedDB not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(request.result || null);
            };
        });
    }

    private isLocalStorageAvailable(): boolean {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch {
            return false;
        }
    }

    private cleanupLocalStorage(): void {
        try {
            // Remove old or large items to free up space
            const keys = Object.keys(localStorage);
            const disparuKeys = keys.filter(key => key.startsWith('messages_app_'));
            
            // Keep only the most recent data
            if (disparuKeys.length > 2) {
                disparuKeys.slice(0, -2).forEach(key => {
                    try {
                        localStorage.removeItem(key);
                    } catch (error) {
                        console.warn('Failed to remove old storage key:', key, error);
                    }
                });
            }
        } catch (error) {
            console.warn('Cleanup failed:', error);
        }
    }

    getStorageInfo(): { localStorage: boolean; indexedDB: boolean; usage?: string } {
        const info = {
            localStorage: this.isLocalStorageAvailable(),
            indexedDB: !!this.db,
            usage: undefined as string | undefined
        };

        // Try to estimate storage usage
        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(estimate => {
                if (estimate.quota && estimate.usage) {
                    const usagePercent = Math.round((estimate.usage / estimate.quota) * 100);
                    info.usage = `${usagePercent}% of ${Math.round(estimate.quota / 1024 / 1024)}MB`;
                }
            }).catch(() => {
                // Ignore errors
            });
        }

        return info;
    }
}

class MessagesApp {
    private messages: Message[] = [];
    private settings: AppSettings = {
        recipientName: 'Someone Great',
        profilePicture: '',
        messageLimit: 10
    };

    private readonly STORAGE_KEYS = {
        MESSAGES: 'messages_app_messages',
        SETTINGS: 'messages_app_settings'
    };

    private storage: RobustStorage = new RobustStorage();

    private elements = {
        messageInput: document.getElementById('messageInput') as HTMLInputElement,
        sendBtn: document.getElementById('sendBtn') as HTMLButtonElement,
        messagesList: document.getElementById('messagesList') as HTMLDivElement,
        messagesContainer: document.getElementById('messagesContainer') as HTMLDivElement,
        settingsBtn: document.getElementById('settingsBtn') as HTMLButtonElement,
        modalOverlay: document.getElementById('modalOverlay') as HTMLDivElement,
        closeBtn: document.getElementById('closeBtn') as HTMLButtonElement,
        faqBtn: document.getElementById('faqBtn') as HTMLButtonElement,
        faqModalOverlay: document.getElementById('faqModalOverlay') as HTMLDivElement,
        faqCloseBtn: document.getElementById('faqCloseBtn') as HTMLButtonElement,
        recipientNameInput: document.getElementById('recipientName') as HTMLInputElement,
        messageLimitInput: document.getElementById('messageLimit') as HTMLInputElement,
        profilePictureInput: document.getElementById('profilePicture') as HTMLInputElement,
        profilePictureFileInput: document.getElementById('profilePictureFile') as HTMLInputElement,
        uploadPreview: document.getElementById('uploadPreview') as HTMLDivElement,
        previewImage: document.getElementById('previewImage') as HTMLImageElement,
        saveSettingsBtn: document.getElementById('saveSettings') as HTMLButtonElement,
        clearMessagesBtn: document.getElementById('clearMessages') as HTMLButtonElement,
        contactName: document.getElementById('contactName') as HTMLSpanElement,
        profilePic: document.getElementById('profilePic') as HTMLImageElement
    };

    constructor() {
        this.init();
    }

    private async init(): Promise<void> {
        await this.storage.init();
        await this.loadFromStorage();
        this.initializeEventListeners();
        this.updateUI();
        this.renderMessages();
        this.handleViewportChanges();
    }

    private initializeEventListeners(): void {
        // Message input and sending
        this.elements.messageInput.addEventListener('input', () => {
            this.toggleSendButton();
        });

        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.elements.sendBtn.addEventListener('click', () => {
            this.sendMessage();
        });

        // Settings modal
        this.elements.settingsBtn.addEventListener('click', () => {
            this.openSettings();
        });

        this.elements.closeBtn.addEventListener('click', () => {
            this.closeSettings();
        });

        this.elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.modalOverlay) {
                this.closeSettings();
            }
        });

        // FAQ modal
        this.elements.faqBtn.addEventListener('click', () => {
            this.openFAQ();
        });

        this.elements.faqCloseBtn.addEventListener('click', () => {
            this.closeFAQ();
        });

        this.elements.faqModalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.faqModalOverlay) {
                this.closeFAQ();
            }
        });

        // Settings actions
        this.elements.saveSettingsBtn.addEventListener('click', () => {
            this.saveSettings();
        });

        this.elements.clearMessagesBtn.addEventListener('click', () => {
            this.clearAllMessages();
        });

        // Handle profile picture file upload
        this.elements.profilePictureFileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e);
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSettings();
                this.closeFAQ();
            }
        });

        // Prevent over-scrolling
        this.elements.messagesContainer.addEventListener('scroll', () => {
            this.preventOverScroll();
        });

        // Handle input focus/blur for mobile keyboards
        this.elements.messageInput.addEventListener('focus', () => {
            setTimeout(() => this.scrollToBottom(), 300);
        });
    }

    private toggleSendButton(): void {
        const hasText = this.elements.messageInput.value.trim().length > 0;
        this.elements.sendBtn.classList.toggle('active', hasText);
    }

    private sendMessage(): void {
        const text = this.elements.messageInput.value.trim();
        if (!text) return;

        const message: Message = {
            id: Date.now().toString(),
            text,
            timestamp: Date.now(),
            type: 'sent'
        };

        this.messages.push(message);
        this.enforcMessageLimit();
        this.saveToStorage();
        this.renderMessages();
        
        // Clear input and update send button
        this.elements.messageInput.value = '';
        this.toggleSendButton();
        
        // Scroll to bottom
        this.scrollToBottom();

        // Add haptic feedback on mobile
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    }

    private enforcMessageLimit(): void {
        if (this.messages.length > this.settings.messageLimit) {
            this.messages = this.messages.slice(-this.settings.messageLimit);
        }
    }

    private renderMessages(): void {
        this.elements.messagesList.innerHTML = '';
        
        this.messages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            this.elements.messagesList.appendChild(messageElement);
        });
    }

    private createMessageElement(message: Message): HTMLDivElement {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}`;
        
        const messageText = document.createElement('div');
        messageText.textContent = message.text;
        
        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = this.formatTime(message.timestamp);
        
        messageDiv.appendChild(messageText);
        messageDiv.appendChild(messageTime);
        
        return messageDiv;
    }

    private formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        if (isToday) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
                   ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 50);
    }

    private openSettings(): void {
        // Populate current settings
        this.elements.recipientNameInput.value = this.settings.recipientName;
        this.elements.messageLimitInput.value = this.settings.messageLimit.toString();
        
        // Show current profile picture or clear inputs
        if (this.settings.profilePicture) {
            if (this.settings.profilePicture.startsWith('data:')) {
                // It's a base64 image - show in preview
                this.elements.previewImage.src = this.settings.profilePicture;
                this.elements.uploadPreview.style.display = 'block';
                this.elements.profilePictureInput.value = '';
                this.elements.profilePictureFileInput.dataset.base64 = this.settings.profilePicture;
            } else {
                // It's a URL - show in URL input
                this.elements.profilePictureInput.value = this.settings.profilePicture;
                this.elements.uploadPreview.style.display = 'none';
                delete this.elements.profilePictureFileInput.dataset.base64;
            }
        } else {
            // No profile picture set
            this.elements.profilePictureInput.value = '';
            this.elements.uploadPreview.style.display = 'none';
            delete this.elements.profilePictureFileInput.dataset.base64;
        }
        
        this.elements.modalOverlay.classList.add('active');
        
        // Focus the first input
        setTimeout(() => {
            this.elements.recipientNameInput.focus();
        }, 300);
    }

    private closeSettings(): void {
        this.elements.modalOverlay.classList.remove('active');
    }

    private openFAQ(): void {
        this.elements.faqModalOverlay.classList.add('active');
    }

    private closeFAQ(): void {
        this.elements.faqModalOverlay.classList.remove('active');
    }

    private saveSettings(): void {
        const recipientName = this.elements.recipientNameInput.value.trim() || 'Someone Great';
        const messageLimit = Math.min(50, Math.max(10, parseInt(this.elements.messageLimitInput.value) || 10));
        
        // Check for uploaded file first, then URL
        const uploadedImage = this.elements.profilePictureFileInput.dataset.base64;
        const profilePicture = uploadedImage || this.elements.profilePictureInput.value.trim();

        // Update settings
        this.settings.recipientName = recipientName;
        this.settings.messageLimit = messageLimit;
        this.settings.profilePicture = profilePicture;

        // Enforce new message limit
        this.enforcMessageLimit();
        
        // Save and update UI
        this.saveToStorage();
        this.updateUI();
        this.renderMessages();
        this.closeSettings();
    }

    private clearAllMessages(): void {
        if (confirm('Are you sure you want to clear all messages? This cannot be undone.')) {
            this.messages = [];
            this.saveToStorage();
            this.renderMessages();
            this.closeSettings();
        }
    }

    private updateUI(): void {
        this.elements.contactName.textContent = this.settings.recipientName;
        
        if (this.settings.profilePicture) {
            this.elements.profilePic.src = this.settings.profilePicture;
            this.elements.profilePic.onerror = () => {
                // Reset to default if image fails to load
                this.elements.profilePic.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNEQ0RDREMiLz4KPHN2ZyB4PSIxMCIgeT0iMTAiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+CjxwYXRoIGQ9Ik0xMiAyQzEzLjEgMiAxNCAyLjkgMTQgNEMxNCA1LjEgMTMuMSA2IDEyIDZDMTAuOSA2IDEwIDUuMSAxMCA0QzEwIDIuOSAxMC45IDIgMTIgMlpNMjEgOVYyMkgzVjlDMyA4LjQ1IDMuNDUgOCA0IDhIMjBDMjAuNTUgOCAyMSA4LjQ1IDIxIDlaIi8+Cjwvc3ZnPgo8L3N2Zz4K";
            };
        }
    }

    private async loadFromStorage(): Promise<void> {
        try {
            const savedMessages = await this.storage.getItem(this.STORAGE_KEYS.MESSAGES);
            if (savedMessages) {
                this.messages = JSON.parse(savedMessages);
            }

            const savedSettings = await this.storage.getItem(this.STORAGE_KEYS.SETTINGS);
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                this.settings = { ...this.settings, ...parsedSettings };
            }
        } catch (error) {
            console.warn('Failed to load from storage:', error);
            // Show user-friendly message if storage is completely broken
            if (error instanceof Error && error.message === 'No storage method available') {
                this.showStorageWarning();
            }
        }
    }

    private async saveToStorage(): Promise<void> {
        try {
            await this.storage.setItem(this.STORAGE_KEYS.MESSAGES, JSON.stringify(this.messages));
            await this.storage.setItem(this.STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
        } catch (error) {
            console.warn('Failed to save to storage:', error);
            // Show user-friendly message
            this.showStorageError();
        }
    }

    private showStorageWarning(): void {
        // Create a subtle warning message
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 152, 0, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 2000;
            max-width: 300px;
            text-align: center;
        `;
        warning.textContent = 'Storage unavailable. Messages will not be saved.';
        document.body.appendChild(warning);
        
        setTimeout(() => {
            document.body.removeChild(warning);
        }, 5000);
    }

    private showStorageError(): void {
        // Create a subtle error message
        const error = document.createElement('div');
        error.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 59, 48, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 2000;
            max-width: 300px;
            text-align: center;
        `;
        error.textContent = 'Failed to save. Storage may be full.';
        document.body.appendChild(error);
        
        setTimeout(() => {
            document.body.removeChild(error);
        }, 3000);
    }

    private handleViewportChanges(): void {
        // Set CSS custom property for viewport height
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        setViewportHeight();
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', () => {
            setTimeout(setViewportHeight, 100);
        });
    }

    private preventOverScroll(): void {
        const container = this.elements.messagesContainer;
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        if (container.scrollTop > maxScroll) {
            container.scrollTop = maxScroll;
        }
        
        if (container.scrollTop < 0) {
            container.scrollTop = 0;
        }
    }

    private handleFileUpload(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        
        if (!file) return;
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }
        
        // Validate file size (limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be smaller than 5MB.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64String = e.target?.result as string;
            
            // Show preview
            this.elements.previewImage.src = base64String;
            this.elements.uploadPreview.style.display = 'block';
            
            // Clear URL input since we're using uploaded file
            this.elements.profilePictureInput.value = '';
            
            // Store the base64 string temporarily for saving
            this.elements.profilePictureFileInput.dataset.base64 = base64String;
        };
        
        reader.onerror = () => {
            alert('Error reading file. Please try again.');
        };
        
        reader.readAsDataURL(file);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MessagesApp();
});

// Handle service worker for offline support (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Service worker registration failed, but app still works
        });
    });
}