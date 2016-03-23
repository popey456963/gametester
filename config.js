var config = {}

config.configVersion = '0.01'
config.programVersion = '0.01'

/*
Error (4) - Log things when the system is in distress, will affect users.
Warn  (3) - Something seems phishy, we'll log it to make sure.
Info  (2) - Helpful things that you might want to know, will be high volume.
Debug (1) - Just about everything, will be extremely high volume.
Trace (0) - A fly moves a couple of centimeters in Africa, you'll know about it.
*/

config.loggingLevel = 'debug'

config.port = 3000
config.url = 'mongodb://localhost:27017/gametester'
config.dataCollection = 'data'
config.serverList = 'servers'
config.playerCollection = 'player'
config.serverStats = 'serverstats'

config.gatherData = true

config.refresh = 30000

module.exports = config
