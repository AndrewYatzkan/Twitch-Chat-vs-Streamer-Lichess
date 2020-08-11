# Twitch-Chat-vs-Streamer-Lichess

## Setup:

1) Install [Node.js](https://nodejs.org/en/download/).

2) Download Twitch-Chat-vs-Streamer-Lichess and navigate to the folder in Terminal (Mac/Linux) or Command Prompt (Windows).

3) Run `npm i`. Note: if you get an error, try running `sudo npm i` on Mac/Linux or running the Command Prompt as Administrator on Windows.

4) Create a file named config.js with the following data:
```
module.exports = {
	STREAMER: "streamer", (streamer's twitch username)
	STREAMER_LICHESS: "lichess", (streamer's lichess username)
	AUTHORIZED_USERS: ["user1", "user2"], (twitch users allowed to use the !setvotingperiod command)
	TWITCH_OAUTH: "oauth:...", (oauth token for bot's twitch account)
	LICHESS_OAUTH: "...", (oauth token for bot's lichess account)
	CHAT_COOLDOWN: 2000, (time in milliseconds to wait between sending messages (1-2 seconds is good) not needed if bot is vip or mod)
	VOTING_PERIOD: 20, (time in seconds that chat has to vote)
	ACKNOWLEDGE_VOTE: true (whether or not the twitch bot should acknowledge users' votes in chat)
};
```

(You can get the twitch oauth token [here](https://twitchapps.com/tmi/), and the lichess oauth token [here](https://lichess.org/api#operation/botAccountUpgrade))

5) Run `node index.js` to start the bot. The voting page should be at [localhost:3000](localhost:3000) (will be a black screen if there aren't currently any votes).

6) Challenge the lichess bot-it will automatically accept challenges from the `STREAMER_LICHESS` account and instructions will be sent to chat!

## Bugs:
 - if the bot is restarted on its turn, it doesn't reconnect
 	- would need to save ongoing games dictionary before it exists
 - tmi.js 'join' event is called late sometimes -> message queue doesn't work at first

## To-do:
 - [x] vote to offer draw
 - [x] vote to resign
 - [x] web page to put on stream that visualizes the voting process
 - [ ] multiple streamers at once! shouldn't be too hard with current setup
 	- Update: won't work unless lichess authorizes the host ip to bypass their rate limiting
 - [ ] support for other variants & from position
