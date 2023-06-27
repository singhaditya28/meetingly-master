const PORT = process.env.PORT || 3000;

const express = require('express');
const axios = require('axios');
const session = require('express-session');

const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io').listen(server);
//io.set('log level', 2);
const morgan = require('morgan');

// log all requests
// app.use(morgan('combined'));

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: '0000', resave: true, saveUninitialized: true }));

app.set('view engine', 'ejs');

app.use(express.static(__dirname + '/public'));
server.listen(PORT, null, function () {
    // console.log("Listening on port " + PORT);
});

app.get('/login', (req, res) => {
    const clientID = 'cf7058fb225cc08b44944f4d403f0ecf';
    const redirectURI = 'https://meetinglyme.onrender.com/callback'; // Set your redirect URI
    const authorizeURL = `https://cf-meetingly.bubbleapps.io/version-test/api/1.1/oauth/authorize?client_id=${clientID}&redirect_uri=${redirectURI}`;
  
    res.redirect(authorizeURL);
  });

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    const clientID = 'cf7058fb225cc08b44944f4d403f0ecf';
    const clientSecret = '7bc8ba22e2151ec944236e2cefe161e1';
    const redirectURI = 'https://meetinglyme.onrender.com/'; // Set your redirect URI
  
    try{
        const tokenEndpoint = `https://cf-meetingly.bubbleapps.io/version-test/api/1.1/oauth/access_token`;
        const tokenResponse = await axios.post(tokenEndpoint, {
            client_id: clientID,
            client_secret: clientSecret,
            redirect_uri: redirectURI,
            code: code,
        });
      console.log(tokenResponse.data);
      const { access_token, expires_in, uid } = tokenResponse.data;
      req.session.accessToken = access_token;
      req.session.uid = uid;
      console.log(req.session.accessToken, '\n', req.session.uid);
      // Store the access_token, expires_in, and uid as needed
      // Redirect the user to the desired page
      res.redirect('/dashboard');
    } catch (error) {
        console.error('Error exchanging code for access token:', error);
        res.status(500).send('An error occurred during the authentication process.');
    }
});
  

app.get('/dashboard', (req, res) => {
    // Verify if the user is authenticated
    if (req.session.accessToken && req.session.uid) {
      // User is authenticated, perform desired actions
      res.send(`
      <h1>Welcome, user ${req.session.uid}!
      Access- token ${req.session.accessToken}</h1>
  
      <h2>Dashboard</h2>
      <ul>
        <li><a href="/dashboard/start">Start a Meet</a></li>
        <li><a href="/dashboard/join">Join a Meet</a></li>
      </ul>
      `);
    } else {
      // User is not authenticated, redirect them to the login page
      res.redirect('/login');
    }
});

// Join Meet route
app.get('/dashboard/join', (req, res) => {
    // Step 7: Check if the user is authenticated
    if (req.session.accessToken && req.session.uid) {
      // User is authenticated, render the join meet form
      res.send(`
        <h1>Join a Meet</h1>
        <form action="/dashboard/meet/" method="POST">
          <input type="text" name="meetId" pattern="[A-Z0-9]{4}" title="Please enter a Meet ID" required />
          <button type="submit">Join Meet</button>
        </form>
      `);
    } else {
      // User is not authenticated, redirect them to the login page
      res.redirect('/login');
    }
});

// Meet Route
app.post('/dashboard/meet/', (req, res) => {
    // Step 8: Check if the user is authenticated
    if (req.session.accessToken && req.session.uid) {
      // User is authenticated, retrieve the meet ID from the form submission
      const meetId = req.body.meetId;
      
      // Perform actions with the meet ID (e.g., join the meet)
    //   res.send(`Joining Meet ${meetId}`);
      res.redirect(`/${meetId}`)
    } else {
      // User is not authenticated, redirect them to the login page
      res.redirect('/login');
    }
});

app.get('/dashboard/start', (req,res) => {
    res.redirect('/');
});


// Fetch user details by ID
const getUserDetails = async (userId, accessToken) => {
  try {
    const response = await axios.post(
      'https://cf-meetingly.bubbleapps.io/version-test/api/1.1/wf/get_meetingly_user_by_id',
      { uid: userId },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching user details:', error);
    throw error;
  }
};


app.get(['/', '/:room'], async (req, res) => {
  // Check if the user is authenticated
  if (req.session.accessToken && req.session.uid) {
    // User is authenticated, allow access to the root route

    // Fetch user details
    try {
      const userDetails = await getUserDetails(req.session.uid, req.session.accessToken);
      console.log(userDetails);
      const fullName = userDetails['User First Name'] + ' ' + userDetails['User Last Name'];
      console.log(fullName , "from app.get /");

      // Render the index.html file with the user's full name
      res.render('index', {
        
        fullName: fullName
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      // Handle the error accordingly (e.g., redirect to an error page)

      // res.redirect('/error');
    }
  } else {
    // User is not authenticated, redirect them to the login page
    res.redirect('/login');
  }
});
/**
 * Users will connect to the signaling server, after which they'll issue a "join"
 * to join a particular channel. The signaling server keeps track of all sockets
 * who are in a channel, and on join will send out 'addPeer' events to each pair
 * of users in a channel. When clients receive the 'addPeer' even they'll begin
 * setting up an RTCPeerConnection with one another. During this process they'll
 * need to relay ICECandidate information to one another, as well as SessionDescription
 * information. After all of that happens, they'll finally be able to complete
 * the peer connection and will be streaming audio/video between eachother.
 */
const channels = {};
const sockets = {};

io.sockets.on('connection', (socket) => {
    socket.channels = {};
    sockets[socket.id] = socket;

    // console.log("[" + socket.id + "] connection accepted");
    socket.on('disconnect', () => {
        for (const channel in socket.channels) {
            part(channel);
        }
        // console.log("[" + socket.id + "] disconnected");
        delete sockets[socket.id];
    });

    socket.on('join', (config) => {
        // console.log("[" + socket.id + "] join ", config);
        const channel = config.channel;
        // const userdata = config.userdata;

        if (channel in socket.channels) {
            // console.log("[" + socket.id + "] ERROR: already joined ", channel);
            return;
        }

        if (!(channel in channels)) {
            channels[channel] = {};
        }

        for (id in channels[channel]) {
            channels[channel][id].emit('addPeer', {'peer_id': socket.id, 'should_create_offer': false});
            socket.emit('addPeer', {'peer_id': id, 'should_create_offer': true});
        }

        channels[channel][socket.id] = socket;
        socket.channels[channel] = channel;
    });

    const part = (channel) => {
        // console.log("[" + socket.id + "] part ");

        if (!(channel in socket.channels)) {
            // console.log("[" + socket.id + "] ERROR: not in ", channel);
            return;
        }

        delete socket.channels[channel];
        delete channels[channel][socket.id];

        for (id in channels[channel]) {
            channels[channel][id].emit('removePeer', {'peer_id': socket.id});
            socket.emit('removePeer', {'peer_id': id});
        }
    }
    socket.on('part', part);

    socket.on('relayICECandidate', (config) => {
        let peer_id = config.peer_id;
        let ice_candidate = config.ice_candidate;
        // console.log("[" + socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate);

        if (peer_id in sockets) {
            sockets[peer_id].emit('iceCandidate', {'peer_id': socket.id, 'ice_candidate': ice_candidate});
        }
    });

    socket.on('relaySessionDescription', (config) => {
        let peer_id = config.peer_id;
        let session_description = config.session_description;
        // console.log("[" + socket.id + "] relaying session description to [" + peer_id + "] ", session_description);

        if (peer_id in sockets) {
            sockets[peer_id].emit('sessionDescription', {
                'peer_id': socket.id,
                'session_description': session_description
            });
        }
    });
});
