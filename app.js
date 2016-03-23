var logger = require('log-js')("APP")
var config = require('./config.js')
logger.changeLength(5)
var gamedig = require("gamedig")
var mongodb = require('mongodb')
var q = require('q')
var MongoClient = mongodb.MongoClient

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

function connectToDatabase(url, callback) {
  MongoClient.connect(url, function(err, db) {
    if (err) logger.error("Unabled to connect to the mongoDB server.  Error: " + err)
    else {
      logger.success("Connection established to " + url)
      callback(db)
    }
  })
}

function queryServer(server, callback) {
  host = server.host.split(":")
  server.host = host[0]
  server.port = parseInt(host[1])
  gamedig.query(server, function(state) {
    if (state.error) {
      logger.warning("Server is offline or inaccessible")
      // logger.warning(state.error)
    }
    else {
      callback(state)
    }
  })
}

function handleData(state, collection, callback, players, serverStats) {
  var names = []

  for (i = 0; i < state.players.length; i++) {
    if (state.players[i].name.indexOf("Unknown from ") == -1) {
      names.push(state.players[i].name)
      addTime(state.players[i].name, state.query.address + ":" + state.query.port, players, serverStats)
    }
  }

  logger.log(state.name + ": " + names.length + " / " + state.maxplayers)

  data = {
    "name": state.name,
    "numPlayers": names.length,
    "maxPlayers": state.maxplayers,
    "names": names,
    "timestamp": new Date()
  }

  collection.insert(data, function(err, result) {
    if (err) logger.error(err)
    // else logger.debug("Inserted Data")
  });
}

function collectServerList(serverList, callback) {
  serverList.find({}).sort({_id: 1}).toArray(function(err, result) {
    callback(result)
  })
}

function addServerToList(serverList, server, callback) {
  serverList.insert(server, function() {
    callback(true)
  })
}

function addTime(playername, server, players, serverStats) {
  var playername = playername.toLowerCase()
  player = {
    name: playername,
    server: server,
    totalTime: 0,
    rawData: []
  }
  players.insert(player, function(err, result) {
    // if (err) logger.warning(playername + " already exists")
    if (!err) logger.log(playername + " added to database")
    players.update({name: playername}, { $push: { rawData: {timestamp: new Date(), time: config.refresh, server: server}}}, function(err, result) {
      if (err) logger.error(err)
      players.update({name: playername}, { $inc: {totalTime: config.refresh} })
      // else logger.log(result)
    })
  })
}

function getPlayerTimeData(playername, players, callback) {
  var playername = playername.toLowerCase()
  var promise = players.find({name: playername}).sort({_id: 1}).toArray(function(err, result) {
    callback(result)
  })
}

function getPlayerTime(playername, players, callback) {
  try {
    getPlayerTimeData(playername, players, function(value) {
      weekTime = 0
      totalTime = 0
      if (value[0]) {
        if (value[0].rawData) {
          if (value[0].rawData.length) {
            // console.log(JSON.stringify(value))
            for (i=0; i<value[0].rawData.length; i++) {
              if (value[0].rawData[i].timestamp.getTime() > Date.now() - 7*24*60*60*1000) {
                weekTime += value[0].rawData[i].time
              }
            }
          }
        }
        if (value[0].totalTime) {
          totalTime = value[0].totalTime
        }
      }
      //logger.log(JSON.stringify(value))
      logger.log("Week Playtime: " + parseInt(weekTime/1000/60) + " minutes")
      logger.log("Total Playtime: " + parseInt(totalTime/1000/60) + " minutes")
      callback({
        weekTime: weekTime,
        totalTime: totalTime
      })
    })
  } catch(e) {
    console.log("Player Data Not Found (Or Another Error): " + e)
  }
}

connectToDatabase(config.url, function(db) {
  var serverList = db.collection(config.serverList)
  var data = db.collection(config.dataCollection)
  var players = db.collection(config.playerCollection)
  var serverStats = db.collection(config.serverStats)
  serverList.createIndex( { host: 1 }, { unique: true } )
  players.createIndex( { name: 1 }, { unique: true } )

  /*addServerToList(serverList, {type: "teamspeak3", host: "ts.outbreak-community.com:9987"}, function(){ 
    logger.log("One Implemented.") 
    addServerToList(serverList, {type: "teamspeak3", host: "steam-speak.com:9987"}, function(){ 
      logger.log("Two Implemented.") 
      collectServerList(serverList, function(servers) {
        logger.log(servers)
      })
    })
  })*/
  // addServerToList(serverList, {type: "csgo", host: "jb.join-ob.com:27015"}, function(){})

  if (config.gatherData) {
    setInterval(function() {
      collectServerList(serverList, function(servers) {
        for (j = 0; j < servers.length; j++) {
          queryServer(servers[j], function(state) {
            handleData(state, data, function() {}, players, serverStats)
          })
        }
      })
    }, config.refresh)
  }
  io.on('connection', function(socket){
    socket.on('player request', function(msg, callback){
      getPlayerTime(msg, players, function(data){
        callback(data)
      })
    });
  });
})

app.get('/', function(req, res){
  res.sendFile(__dirname + '/pages/index.html');
});

app.get('/hours', function(req, res){
  res.sendFile(__dirname + '/pages/hours.html');
});

http.listen(config.port, function(){
  logger.log('Listening on *:' + String(config.port));
});