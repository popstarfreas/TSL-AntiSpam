import ChatMessage from "../../chatmessage";
import Client from "../../client";
import TerrariaServer from "../../terrariaserver";
import Extension from "../extension";

interface SpamMessage {
    text: string;
    timestamp: number;
}

interface SpamTrack {
    previousMessages: SpamMessage[];
}

class AntiSpam extends Extension {
    public name = "AntiSpam";
    public version = "v1.0";
    public spamTracking = new Map<Client, SpamTrack>();
    private _maxCapRatio = 0.7;
    private _maxShortMessages = 2;
    private _minLongMessage = 4;
    private _maxPreviousMessages = 6;
    private _maxShortSpamTime = 4000;
    private _maxRepetitionTime = 40000;
    private _maxGeneralSpamScore = 3450;
    private _ipRegex = /((?:[0-9]{1,3}(\.|,)){3}[0-9]{1,3})/g;
    private _currentClient: Client;
    private _currentTrack: SpamTrack;
    private _currentChatMessage: ChatMessage;
    public static terrariaVersions = [
        "1.3.5.3",
        "1.3.5.2",
        "1.3.5.1",
        "1.3.4.4",
        "1.3.4.3",
        "1.3.4.2",
        "1.3.4.1",
        "1.3.3.3",
        "1.3.3.2",
        "1.3.3.1",
        "1.3.2.1",
        "1.3.1.1",
        "1.3.0.8",
        "1.3.0.7",
        "1.3.0.6",
        "1.3.0.5",
        "1.3.0.4",
        "1.3.0.3",
        "1.3.0.2",
        "1.3.0.1",
        "1.2.4.1",
        "1.2.1.2",
        "1.2.1.1",
        "1.2.0.3",
        "1.2.0.2",
        "1.2.0.1",
        "1.0.6.1"
    ];

    constructor(server: TerrariaServer) {
        super(server);
    }

    public handleClientDisconnect(client: Client): void {
        this.spamTracking.delete(client);
    }

    public modifyChat(client: Client, chatMessage: ChatMessage): void {
        this._currentClient = client;
        this._currentChatMessage = chatMessage;

        if (chatMessage.content.length > 0 && (this.chatViolates() || this.checkPostedIp())) {
            // Clear content to avoid it being sent out in server chat
            chatMessage.content = "";
        }
    }

    private chatViolates(): boolean {
        if (!this.spamTracking.has(this._currentClient)) {
            this.spamTracking.set(this._currentClient, {
                previousMessages: []
            });
        }

        this._currentTrack = this.spamTracking.get(this._currentClient) as SpamTrack;

        const violates = this.checkCapitals()
            || this.checkShortSpam()
            || this.checkRepetition()
            || this.checkGeneralSpam()
            || this.trimRepeatedLetters();

        if (!violates) {
            this._currentTrack.previousMessages.push({
                text: this._currentChatMessage.content,
                timestamp: Date.now()
            });

            if (this._currentTrack.previousMessages.length > this._maxPreviousMessages) {
                this._currentTrack.previousMessages.shift();
            }
        }

        return violates;
    }

    private checkPostedIp(): boolean {
        let violates = this._ipRegex.test(this._currentChatMessage.content);
        if (violates) {
            let violations = 0;
            let ips = "";
            const matches = this._currentChatMessage.content.match(this._ipRegex) as RegExpMatchArray;
            for (const match of matches) {
                if (AntiSpam.terrariaVersions.indexOf(match) === -1) {
                    if (ips.length > 0) {
                        ips += ", ";
                    }
                    ips += match;
                    violations++;
                    break;
                }
            }

            if (violations > 0) {
                this._currentClient.server.banManager.ban(this._currentClient, "Advertising");
                console.log(`${this._currentClient.player.name} used ${ips}`);
            } else {
                violates = false;
            }
        }

        return violates;
    }

    private checkCapitals(): boolean {
        const capitals = AntiSpam.countCapitals(this._currentChatMessage.content);
        const capitalRatio = capitals / AntiSpam.countLetters(this._currentChatMessage.content);
        if (capitalRatio > this._maxCapRatio) {
            this._currentClient.sendChatMessage(`That message contained too many capitals letters. `
                + `${capitalRatio * 100}% caps when maximum allowed is ${this._maxCapRatio * 100}%`, {
                    R: 255,
                    G: 0,
                    B: 0
                });

            return true;
        }

        return false;
    }

    private checkShortSpam(): boolean {
        let shortMessages = 0;
        for (const message of this._currentTrack.previousMessages) {
            if (message.text.length <= this._minLongMessage && Date.now() - message.timestamp < this._maxShortSpamTime) {
                shortMessages++;
            }
        }

        if (shortMessages > this._maxShortMessages) {
            this._currentClient.sendChatMessage(`You have spammed too many short messages.`, {
                    R: 255,
                    G: 0,
                    B: 0
                });

            return true;
        }

        return false;
    }

    private checkRepetition(): boolean {
        const previousMessages = this._currentTrack.previousMessages;
        if (previousMessages.length > 0) {
            const previousMessage = previousMessages[previousMessages.length - 1];
            if (previousMessage.text.trim() === this._currentChatMessage.content.trim()
                && Date.now() - previousMessage.timestamp < this._maxRepetitionTime) {
                this._currentClient.sendChatMessage(`You have repeated yourself in a short amount of time.`, {
                    R: 255,
                    G: 0,
                    B: 0
                });
                return true;
            }
        }

        return false;
    }

    private checkGeneralSpam(): boolean {
        const previousMessages = this._currentTrack.previousMessages;
        if (previousMessages.length > 0) {
            // More messages with less time results in lower score
            const score = (Date.now() - previousMessages[0].timestamp) / previousMessages.length;
            if (score < this._maxGeneralSpamScore) {
                this._currentClient.sendChatMessage(`You have sent messages too quickly. Don't break up your messages into multiple-lines.`, {
                    R: 255,
                    G: 0,
                    B: 0
                });

                return true;
            }
        }

        return false;
    }

    private trimRepeatedLetters(): boolean {
        this._currentChatMessage.content = this._currentChatMessage.content.replace(/(.)\1{3,}/ig, "$1$1");
        return false;
    }

    public static countCapitals(text: string): number {
        let capitals = 0;
        for (const c of text) {
            if (parseInt(c).toString() !== c && c === c.toUpperCase() && c !== c.toLowerCase()) {
                capitals++;
            }
        }

        return capitals;
    }

    public static countLetters(text: string): number {
        let letters = 0;
        for (const c of text) {
            if (AntiSpam.isLetter(c)) {
                letters++;
            }
        }

        return letters;
    }

    public static isLetter(text) {
         return /[A-z]/.test(text);
    }
}

export default AntiSpam;
