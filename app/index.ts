import ChatMessage from "terrariaserver-lite/chatmessage";
import Client from "terrariaserver-lite/client";
import TerrariaServer from "terrariaserver-lite/terrariaserver";
import Extension from "terrariaserver-lite/extensions/extension";
import Utils from "./utils";

interface SpamMessage {
    text: string;
    timestamp: number;
}

interface SpamTrack {
    previousMessages: SpamMessage[];
}

class AntiSpam extends Extension {
    public name = "AntiSpam";
    public version = "v1.2";
    public spamTracking = new Map<Client, SpamTrack>();
    private _maxCapRatio = 0.7;
    private _maxShortMessages = 2;
    private _minLongMessage = 4;
    private _maxPreviousMessages = 6;
    private _maxShortSpamTime = 4000;
    private _maxRepetitionTime = 40000;
    private _maxGeneralSpamScore = 3450;
    private _ipRegex = /((?:[0-9]{1,3}(\.|,)){3}[0-9]{1,3})/g;
    private _knownServersIpRegex = /terraria\.one|pedguin\.com|t\.teeria\.eu|s\.terraz\.ru|t\.aurora-gaming\.com|terraria\.tk|yamahi\.eu/g;
    private _currentClient: Client;
    private _currentTrack: SpamTrack;
    private _currentChatMessage: ChatMessage;

    constructor(server: TerrariaServer) {
        super(server);
    }

    public handleClientDisconnect(client: Client): void {
        this.spamTracking.delete(client);
    }

    public modifyChat(client: Client, chatMessage: ChatMessage): void {
        this._currentClient = client;
        this._currentChatMessage = chatMessage;

        if (chatMessage.content.length > 0 && (this.chatViolates() || this.checkPostedIp() || this.checkPostedRacism())) {
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

    private checkPostedRacism() {
        const message = this._currentChatMessage.content.toLowerCase();
        if (message.indexOf("nigger") >= 0) {
            this._currentClient.server.banManager.banClient(this._currentClient, `S1#4 Racism/Discrimination: ${message}`);
            return true;
        }

        if (message.indexOf("nigga") >= 0) {
            this._currentClient.sendChatMessage(`That message contained words that violate the rules. If you try to bypass this automated check, you will be banned.`,
              {
                R: 255,
                G: 0,
                B: 0
              });
            return true;
        }

        return false;
    }

    private checkPostedIp(): boolean {
        let violates = this._ipRegex.test(this._currentChatMessage.content);
        if (violates) {
            let violations = 0;
            let ips = "";
            let matches = this._currentChatMessage.content.match(this._ipRegex) as RegExpMatchArray;
            for (const match of matches) {
                if (!match.startsWith("1.") && !match.startsWith("2.") && !match.startsWith("3.")) {
                    if (ips.length > 0) {
                        ips += ", ";
                    }
                    ips += match;
                    violations++;
                    break;
                }
            }

            matches = this._currentChatMessage.content.match(this._knownServersIpRegex) as RegExpMatchArray;
            for (const match of matches) {
                if (ips.length > 0) {
                    ips += ", ";
                }
                ips += match;
                violations++;
                break;
            }

            if (violations > 0) {
                this._currentClient.server.banManager.banClient(
                    this._currentClient,
                    `Advertising ${ips} in "${this._currentChatMessage.content}"`,
                    {
                        id: 73026,
                        uuid: "",
                        group: {
                            name: "",
                            prefix: "",
                            suffix: "",
                            color: "",
                            permissions: "",
                            parent: null,
                            parentName: "",
                        },
                        name: "System",
                        registerDate: 0,
                        knownIps: [],
                    }
                );
                console.log(`${this._currentClient.player.name} used ${ips}`);
            } else {
                violates = false;
            }
        }

        return violates;
    }

    private checkCapitals(): boolean {
        const capitals = Utils.countCapitals(this._currentChatMessage.content);
        const capitalRatio = capitals / Utils.countLetters(this._currentChatMessage.content);
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
        /*
        To reach consistency between TSL and TShock the repeated character filter has been adjusted as well
        to allow 4 same digits in a row ([i:4444] and 9999 pass) and
        to block spam of over 3 consecutive same punctuation
        instead of only blocking over 3 repeated word characters
        Now also blocking consecutive non-ASCII letter spam
        */
        this._currentChatMessage.content = this._currentChatMessage.content.replace(/(\d)\1{4,}|([^\d])\2{3,}/ig, "$1$1$1$1$2$2$2");
        return false;
    }

}

export default AntiSpam;
