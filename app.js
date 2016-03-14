var logger = require('./modules/logger.js')
var config = require('./config.js')
var l = "APP"

var gamedig = require("gamedig")
var mongodb = require('mongodb')
var q = require('q')
var MongoClient = mongodb.MongoClient

function connectToDatabase(url, callback) {
  MongoClient.connect(url, function(err, db) {
    if (err) console.log("Unabled to connect to the mongoDB server.  Error:", err)
    else {
      console.log("Connection established to", url)
      callback(db)
    }
  })
}

function queryServer(server, callback) {
  host = server.host.split(":")
  server.host = host[0]
  server.port = parseInt(host[1])
  gamedig.query(server, function(state) {
    if (state.error) console.log("Server is offline or inaccessible")
    else {
      callback(state)
    }
  })
}

function handleData(state, collection, callback, players, serverStats) {
  var names = []

  for (i = 0; i < state.players.length; i++) {
    names.push(state.players[i].name)
    addTime(state.players[i].name, state.query.address + ":" + state.query.port, players, serverStats)
  }

  console.log(state.name + ": " + names.length + " / " + state.maxplayers)

  data = {
    "name": state.name,
    "numPlayers": names.length,
    "maxPlayers": state.maxplayers,
    "names": names,
    "timestamp": new Date()
  }

  collection.insert(data, function(err, result) {
    if (err) console.log(err)
    // else console.log("Inserted Data")
  });
}

function collectServerList(serverList, callback) {
  var promise = serverList.find({}).sort({_id: 1}).toArray(function(err, result) {
    callback(result)
  })
}

function addServerToList(serverList, server, callback) {
  serverList.insert(server, function() {
    callback(true)
  })
}

function addTime(playername, server, players, serverStats) {
  player = {
    name: playername,
    rawData: []
  }
  players.insert(player, function(err, result) {
    if (err) console.log(playername + " already exists")
    players.update({name: playername}, { $push: { rawData: {timestamp: new Date(), time: config.refresh}}}, function(err, result) {
      if (err) console.log(err)
      // else console.log(result)
    })
  })
}

function getPlayerTime(playername, players, callback) {
  var promise = players.find({name: playername}).sort({_id: 1}).toArray(function(err, result) {
    callback(result)
  })
}

connectToDatabase(config.url, function(db) {
  var serverList = db.collection(config.serverList)
  var data = db.collection(config.dataCollection)
  var players = db.collection(config.playerCollection)
  var serverStats = db.collection(config.serverStats)
  serverList.createIndex( { host: 1 }, { unique: true } )
  players.createIndex( { name: 1 }, { unique: true } )

  getPlayerTime("Brand0n", players, function(value) {
    weekTime = 0
    for (i=0; i<value[0].rawData.length; i++) {
      if (value[0].rawData[i].timestamp > Date.now() - 7*24*60*60*1000) {
        weekTime += value[0].rawData[i].time
      }
    }
    //console.log(JSON.stringify(value))
    console.log(weekTime/1000 + " seconds")
  })

  /*addServerToList(serverList, {type: "teamspeak3", host: "ts.outbreak-community.com:9987"}, function(){ 
    console.log("One Implemented.") 
    addServerToList(serverList, {type: "teamspeak3", host: "steam-speak.com:9987"}, function(){ 
      console.log("Two Implemented.") 
      collectServerList(serverList, function(servers) {
        console.log(servers)
      })
    })
  })*/
  // addServerToList(serverList, {type: "csgo", host: "jb.join-ob.com:27015"}, function(){})

  setInterval(function() {
    collectServerList(serverList, function(servers) {
      for (j = 0; j < servers.length; j++) {
        queryServer(servers[j], function(state) {
          handleData(state, data, function() {}, players, serverStats)
        })
      }
    })
  }, config.refresh)
})
