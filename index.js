// vvvv for debugging
process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

var OPTS = require('./config.js');

var messageQueue = [];

const { Chess } = require('chess.js');
const chess = new Chess();
var sloppyPGN = false;
var candidates = {};
var voters = [];
var ongoingGames = {};
var cooldownInterval;

// Socket.io part ---------------------------------------------

var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var port = 3000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/votes.html');
});

io.on('connection', (socket) => {
	socket.emit('candidates', candidates);
});

http.listen(port, () => {
  console.log(`Express server listening on *:${port}`);
});

// ------------------------------------------------------------

const https = require('https');
const tmi = require('tmi.js');

const client = new tmi.Client({
	options: { debug: false }, // set to false to get rid of console messages
	connection: {
		secure: true,
		reconnect: true
	},
	identity: {
		username: 'TTVChat',
		password: OPTS.TWITCH_OAUTH
	},
	channels: [ OPTS.STREAMER ]
});

client.connect();

client.on('join', () => {
	let userstate = client.userstate[`#${OPTS.STREAMER.toLowerCase()}`];
	OPTS.COOLDOWN_APPLIES = !(userstate.mod || (userstate.badges && userstate.badges.vip));

	if (OPTS.COOLDOWN_APPLIES && !cooldownInterval) {
		cooldownInterval = setInterval(() => {
			let msg;
			if (msg = messageQueue.shift()) client.say(OPTS.STREAMER, msg)
		}, OPTS.CHAT_COOLDOWN);
	}
});

client.on('message', (channel, tags, message, self) => {
	if (self) return;

	// console.log(sloppyPGN !== false , /^[RNBKQK0-8a-h+#x=]{2,7}$/i.test(message) , !voters.includes(tags.username))
	// console.log(voters);
	if (OPTS.AUTHORIZED_USERS.includes(tags.username) && /^!setvotingperiod \d+$/i.test(message)) {
		let voting_period;
		if ((voting_period = parseInt(message.split(' ')[1])) && voting_period > 3 && voting_period < 1200) {
			OPTS.VOTING_PERIOD = voting_period;
			say(`Voting period is now ${OPTS.VOTING_PERIOD} seconds.`);
		}
	}
	if (sloppyPGN !== false && /^([RNBKQK0-8a-h+#x=-]{2,7}|resign)$/i.test(message) && !voters.includes(tags.username) && tags.username !== OPTS.STREAMER.toLowerCase()) { // regex here is a *very* crude filter to only let messages that might be moves in
		if (/^[Oo0]-[Oo0]$/.test(message)) message = 'O-O';
		if (/^[Oo0]-[Oo0]-[Oo0]$/.test(message)) message = 'O-O-O';

		let resign = message.toLowerCase().trim() === 'resign'; // added resign functionality in a pinch-might want to make code cleaner

		chess.load_pgn(sloppyPGN, { sloppy: true });
		
		let move;
		if (resign || (move = chess.move(message, { sloppy: true })) || (move = chess.move(message.charAt(0).toUpperCase() + message.slice(1), { sloppy: true }))) {
			let UCI = resign ? 'resign' : move.from + move.to;
			let SAN = resign ? 'resign' : move.san;
			if (candidates[UCI])
				candidates[UCI].votes++;
			else
				candidates[UCI] = { votes: 1, SAN };

			voters.push(tags.username)

			io.emit('candidates', candidates);

			// if (OPTS.ACKNOWLEDGE_VOTE) client.say(channel, `@${tags['display-name']} voted for ${UCI}!`);
			if (OPTS.ACKNOWLEDGE_VOTE) say(`@${tags['display-name']} voted for ${SAN}!`);
			else console.log(`@${tags['display-name']} voted for ${SAN}!`);

			// console.log(candidates);
		}
	}
});

function streamIncomingEvents() {
    const options = {
        hostname: 'lichess.org',
        path: '/api/stream/event',
        headers: { Authorization: `Bearer ${OPTS.LICHESS_OAUTH}` }
    };

    return new Promise((resolve, reject) => {
        https.get(options, (res) => {
            res.on('data', (chunk) => {
                let data = chunk.toString();
                try {
                	let json = JSON.parse(data);
                	if (json.type === 'challenge' && json.challenge.challenger.id === OPTS.STREAMER_LICHESS.toLowerCase()) {
                		acceptChallenge(json.challenge.id);
                	} else if (json.type === 'gameStart')
                		beginGame(json.game.id);
                } catch (e) { return; }
            });
            res.on('end', () => {
                reject(new Error('[streamIncomingEvents()] Stream ended.'));
            });
        });
    });
}

async function streamGameState(gameId) {
    const options = {
        hostname: 'lichess.org',
        path: `/api/bot/game/stream/${gameId}`,
        headers: { Authorization: `Bearer ${OPTS.LICHESS_OAUTH}` }
    };

    return new Promise((resolve, reject) => {
        https.get(options, (res) => {
            res.on('data', async (chunk) => {
                let data = chunk.toString();
                if (!data.trim()) return;
                try {
                	let json = JSON.parse(data);

                	if (json.type === 'gameFull') {
                		ongoingGames[gameId].white = json.white.title === 'BOT'; // assumes we're not playing against a bot account
                		json = json.state;
                	}
                	if (json.type === 'gameState') {
                		if (json.status === 'started') {
	                		let numMoves = json.moves ? json.moves.split(' ').length : 0;
	                		if (numMoves % 2 != ongoingGames[gameId].white) {
	                			// bot's turn to move
	                			if (numMoves >= 1) {
	                				// nicer way to write this code? had to add it in a pinch
	                				let sloppyPGN = json.moves.split(' ');
	                				let streamerMove = sloppyPGN.pop();
	                				chess.load_pgn(sloppyPGN.join(' '), { sloppy: true });
									streamerMove = chess.move(streamerMove, { sloppy: true });
	                				say(`Streamer played: ${streamerMove.san}`);
	                			}

	                			await initiateVote(gameId, json.moves);
	                		}
                		} else if (json.winner || json.status === 'draw') {
                			if (json.status === 'draw') resolve('draw');
                			if (json.winner === 'white' ^ ongoingGames[gameId].white)
                				resolve('streamer');
                			else
                				resolve('chat');
                		}
                	}
                } catch (e) { console.log(`Data: ${data}`, `Error: ${e}`); }
            });
            res.on('end', () => {
                resolve();
            });
        });
    });
}

function say(msg) {
	console.log(...arguments);

	if (OPTS.COOLDOWN_APPLIES)
		messageQueue.push(msg);
	else
		client.say(OPTS.STREAMER, msg);
}

async function initiateVote(gameId, moves, revote=0) {
	if (!Object.keys(ongoingGames).includes(gameId)) return;
	// say(revote ? `Nobody voted for a valid move! You have ${OPTS.VOTING_PERIOD} seconds to vote again. (${revote})` : `Voting time! You have ${OPTS.VOTING_PERIOD} seconds to name a move (UCI format, ex: e2e4).`);
	if (!revote) say(`Voting time! You have ${OPTS.VOTING_PERIOD} seconds to name a move.`);
	sloppyPGN = moves;
	setTimeout(async () => {
		var arr = Object.keys(candidates).map(key => [key, candidates[key].votes, candidates[key].SAN]);
		if (arr.length == 0) {
			await initiateVote(gameId, moves, ++revote);
			return;
		}
		var winningMove = arr.sort((a, b) => b[1] - a[1])[0];

		sloppyPGN = false;
		voters = [];
		candidates = {};
		io.emit('candidates', candidates);

		if (!Object.keys(ongoingGames).includes(gameId)) return;
		if (winningMove[0] === 'resign')
			await resignGame(gameId);
		else
			await makeMove(gameId, winningMove[0] /* UCI */);
		say(`Playing move: ${winningMove[2] /* SAN */}`);
	}, OPTS.VOTING_PERIOD * 1000);
}

async function beginGame(gameId) {
	try {
		say('Game started!', gameId);
		ongoingGames[gameId] = { white: null };
		var result = await streamGameState(gameId);
		delete ongoingGames[gameId];
		switch (result) {
			case 'draw':
				say('Game over - It\'s a draw!', gameId);
				break;
			case 'chat':
				say('Chat wins! PogChamp', gameId);
				break;
			case 'streamer':
				say(`${OPTS.STREAMER} wins! Better luck next time chat.`, gameId);
				break;
			default: // should only happen if game state stops streaming for unknown reason
				say('Game over.', gameId);
		}
	} catch (e) {
		console.log(e);
	}
}

async function acceptChallenge(challengeId) {
	const options = {
        hostname: 'lichess.org',
        path: `/api/challenge/${challengeId}/accept`,
        headers: { Authorization: `Bearer ${OPTS.LICHESS_OAUTH}` },
        method: 'POST'
    };

    return new Promise((resolve, reject) => {
    	var req = https.request(options, (res) => {
	    	res.on('data', (data) => {
	    		data = JSON.parse(data.toString());
	    		if (data.ok) {
	    			resolve(true);
	    		} else {
	    			reject(data);
	    		}
	    	});
	    });
		
		req.on('error', (e) => {
			reject(e);
		});

		req.end();
    });
}

async function resignGame(gameId) {
	const options = {
        hostname: 'lichess.org',
        path: `/api/bot/game/${gameId}/resign`,
        headers: { Authorization: `Bearer ${OPTS.LICHESS_OAUTH}` },
        method: 'POST'
    };

    return new Promise((resolve, reject) => {
    	var req = https.request(options, (res) => {
	    	res.on('data', (data) => {
	    		data = JSON.parse(data.toString());
	    		if (data.ok) {
	    			resolve(true);
	    		} else {
	    			reject(data);
	    		}
	    	});
	    });
		
		req.on('error', (e) => {
			reject(e);
		});

		req.end();
    });
}

async function makeMove(gameId, move, draw=false) {
	const options = {
        hostname: 'lichess.org',
        path: `/api/bot/game/${gameId}/move/${move}?offeringDraw=${draw}`,
        headers: { Authorization: `Bearer ${OPTS.LICHESS_OAUTH}` },
        method: 'POST'
    };

    return new Promise((resolve, reject) => {
    	var req = https.request(options, (res) => {
	    	res.on('data', (data) => {
	    		data = JSON.parse(data.toString());
	    		if (data.ok) {
	    			resolve(true);
	    		} else {
	    			reject(data);
	    		}
	    	});
	    });
		
		req.on('error', (e) => {
			reject(e);
		});

		req.end();
    });
}

streamIncomingEvents();