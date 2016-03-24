var logger = require('log-js')("APP")
var config = require('./config.js')
logger.changeLength(5)
var gamedig = require("gamedig")
var mongodb = require('mongodb')
var q = require('q')
var MongoClient = mongodb.MongoClient

var saveData = {}
var games = ["csgo"]

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

Date.prototype.getWeekNumber = function(){
    var d = new Date(+this)
    d.setHours(0,0,0)
    d.setDate(d.getDate()+4-(d.getDay()||7))
    return Math.ceil((((d-new Date(d.getFullYear(),0,1))/8.64e7)+1)/7)
};

function connectToDatabase(url, callback) {
  MongoClient.connect(url, function(err, db) {
    if (err) logger.error("Unable to connect to the mongoDB server.  Error: " + err)
    else {
      logger.success("Connection established to " + url)
      callback(db)
    }
  })
}

function queryServer(server, callback, iteration) {
  // console.log(server)
  host = server.host.split(":")
  server.host = host[0]
  server.port = parseInt(host[1])
  var combined = {host: server.host, port: server.port, type: server.type}
  // console.log(host)
  gamedig.query(server, function(state) {
    if (state.error) {
      logger.warning("Server is offline or inaccessible, using backup")
      if (saveData[combined.host]) {
        callback(saveData[combined.host])
      } else {
        logger.error("No backup!")
      }
    }
    else {
      saveData[combined.host] = state
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
      incServer(serverStats, state, state.players[i].name)
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

/* PLAYER OBJECT {
  name: playername
  servers: [
    {
      totalTime: 0
      hourly: [hour: timePlayed, hour: timePlayed]      
      daily: [day: timePlayed, day: timePlayed]
      weekly: [week: timePlayed, week: timePlayed]
      monthly: [month: timePlayed, month: timePlayed]
    }
  ]    
} */

function addTime(playername, server, players, serverStats) {
  players.find({name: playername}).toArray(function (err, result) {
    if (err) {
      logger.log(err);
    } else if (result.length) {
      // logger.log(JSON.stringify(result[0]))
      data = result[0]
      
      d = new Date()
      currentHour = [d.getHours(), d.getDate(), d.getMonth(), d.getFullYear()].join("|")
      currentDay = [d.getDate(), d.getMonth(), d.getFullYear()].join("|")
      currentWeek = [d.getWeekNumber(), d.getFullYear()].join("|")
      currentMonth = [d.getMonth(), d.getFullYear()].join("|")
      // logger.log(currentHour + " " + currentDay + " " + currentWeek + " " + currentMonth)
      var index = -1
      for (i=0; i<data.servers.length; i++) {
        if (data.servers[i].name == server) {
          index = i
        }
      }
      if (index > -1) {
        if (data.servers[index].hourly[currentHour]) { data.servers[index].hourly[currentHour] += config.refresh
        } else { data.servers[index].hourly[currentHour] = config.refresh }
        if (data.servers[index].daily[currentDay]) { data.servers[index].daily[currentDay] += config.refresh
        } else { data.servers[index].daily[currentDay] = config.refresh }
        if (data.servers[index].weekly[currentWeek]) { data.servers[index].weekly[currentWeek] += config.refresh
        } else { data.servers[index].weekly[currentWeek] = config.refresh }
        if (data.servers[index].monthly[currentMonth]) { data.servers[index].monthly[currentMonth] += config.refresh
        } else { data.servers[index].monthly[currentMonth] = config.refresh }
        data.servers[index].total += config.refresh
      } else {
        data.servers.push({
          name: server,
          hourly: {},
          daily: {},
          weekly: {},
          monthly: {},
          total: 0
        })
      }
      players.update( {name: playername}, data )
    } else {
      players.insert({
        name: playername,
        servers: [{ name: server, hourly: {}, daily: {}, weekly: {}, monthly: {}, total: 0 }]
      })
    }
  })
}

/* SERVER OBJECT {
  name: servername
  ip: serverIP
  type: csgo
  prettyType: Counter-Strike: Global Offensive
  rank: {rankData: rankData, currentRank:currentRank}
  players: {playerName: timePlayed, playerName: timePlayed}
  maps: {total: 0, jb_jail: 0}
} */

function incServer(serverStats, state, playerName) {
  console.log(state)
  serverStats.find({ip: state.query.address + ":" + state.query.port}).toArray(function (err, result) {
    if (err) {
      logger.log(err);
    } else if (result.length) {
      // UPDATE DATA
      var result = result[0]
      result[name] = state.name
      result[type] = state.query.type
      result[prettyType] = state.query.pretty
    } else {
      var dataStuff = {
        ip: state.query.host + ":" + state.query.port,
        name: state.name,
        type: state.query.type,
        prettyType: state.query.pretty,
        players: {}
      }
      dataStuff.players[playerName] = config.refresh
      if (state.query.type in games) {
        dataStuff.maps["total"] = 1
        dataStuff.maps[state.map] = 1
        // maps[]
      }
      serverStats.insert(dataStuff)
    }
  })
}

function getPlayerTime(playername, players, callback) {
  players.find({name: playername}).sort({_id: 1}).toArray(function(err, result) {
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

  // addServerToList(serverList, {type: "csgo", host: "jb.join-ob.com:27015"}, function(){})

  if (config.gatherData) {
    setInterval(function() {
      collectServerList(serverList, function(servers) {
        for (j = 0; j < servers.length; j++) {
          queryServer(servers[j], function(state) {
            handleData(state, data, function() {}, players, serverStats)
            incServer(serverStats, state)
          }, 0)
        }
      })
    }, config.refresh * 1000)
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
