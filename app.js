var logger = require('./modules/logger.js')
var config = require('./config.js')
var l = "APP"

var gamedig = require("gamedig")
var mongodb = require('mongodb')
var q = require('q')
var MongoClient = mongodb.MongoClient

function connectToDatabase(url, callback) {
  MongoClient.connect(url, function(err, db) {
    if (err) logger.error(l, "Unabled to connect to the mongoDB server.  Error: " + err)
    else {
      logger.success(l, "Connection established to " + url)
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
      logger.warning(l, "Server is offline or inaccessible")
      logger.warning(l, state.error)
    }
    else {
      if (state.query.type == "csgo") {
        console.log(JSON.stringify(state))
        console.log(gjor)
      }
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

  logger.log(l, state.name + ": " + names.length + " / " + state.maxplayers)

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
    server: server,
    totalTime: 0,
    rawData: []
  }
  player.totalTime
  players.insert(player, function(err, result) {
    // if (err) logger.warning(playername + " already exists")
    if (!err) logger.log(l, playername + " added to database")
    players.update({name: playername}, { $push: { rawData: {timestamp: new Date(), time: config.refresh, server: server}}}, function(err, result) {
      if (err) logger.error(l, err)
      players.update({name: playername}, { $inc: {totalTime: config.refresh} })
      // else logger.log(l, result)
    })
  })
}

function getPlayerTimeData(playername, players, callback) {
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

  getPlayerTimeData("jemoeder", players, function(value) {
    weekTime = 0
    // console.log(JSON.stringify(value))
    for (i=0; i<value[0].rawData.length; i++) {
      console.log(value[0].rawData[i].timestamp.getTime())
      if (value[0].rawData[i].timestamp > Date.now() - 7*24*60*60*1000) {
        weekTime += value[0].rawData[i].time
      }
    }
    //logger.log(l, JSON.stringify(value))
    logger.log(l, "Playtime: " + parseInt(weekTime/1000/60) + " minutes")
    logger.log(l, "Calc Playtime: " + parseInt(value[0].totalTime/1000/60) + " minutes")
  })

  /*addServerToList(serverList, {type: "teamspeak3", host: "ts.outbreak-community.com:9987"}, function(){ 
    logger.log(l, "One Implemented.") 
    addServerToList(serverList, {type: "teamspeak3", host: "steam-speak.com:9987"}, function(){ 
      logger.log(l, "Two Implemented.") 
      collectServerList(serverList, function(servers) {
        logger.log(l, servers)
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
