# Twitch-Chat-vs-Streamer-Lichess

## How to use:

1) Create a file named config.js with the following code:
```
module.exports = {
	STREAMER: (String) streamer's twitch username,
	STREAMER_LICHESS: (String) streamer's lichess username,
	TWITCH_OAUTH: (String) oauth token for bot's twitch account,
	LICHESS_OAUTH: (String) oauth token for bot's lichess account,
	CHAT_COOLDOWN: (int) time in milliseconds to wait between sending messages (1-2 seconds is good) not needed if bot is vip or mod,
	VOTING_PERIOD: (int) time in seconds that chat has to vote,
	ACKNOWLEDGE_VOTE: (Boolean) whether or not the twitch bot should acknowledge users' votes in chat
};
```

2) The streamer needs to challenge the lichess bot-it should automatically accept it and the game will begin with instructions sent to chat!

## To-do:
 - vote to offer draw
 - vote to resign
 - web page to put on stream that visualizes the voting process
