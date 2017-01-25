
const fs = require('fs')
const debug = require('debug')('api')
const bandname = require('bandname')
const filenamify = require('filenamify')
const jwt = require('jsonwebtoken')
const _ = require('lodash')
const LRU = require('lru-cache')
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const port = process.env.PORT || 3000

app.use(express.static('public'))

const JWT_SECRET = process.env.JWT_SECRET

const cache = LRU({
  max: parseInt(process.env.CACHE_SIZE, 10), // # items in cache not size
  maxAge: parseInt(process.env.CACHE_MAX_AGE, 10)
})

const MAX_DATA_SIZE_JSON = parseInt(process.env.MAX_DATA_SIZE_JSON, 10)

try {
  fs.mkdirSync('.data')
} catch (error) {
  debug(error.message)
}

function pathTo (username) {
  return `.data/${filenamify(username)}.json`
}

function read (username) {
  debug('read "%s"', username)

  var data = cache.get(username)
  if (data) {
    debug('cache hit username="%s"', username)
    return data
  }

  const path = pathTo(username)
  debug('cache miss username="%s" path="%s"', username, path)

  const json = fs.readFileSync(path, 'utf8')
  const size = Buffer.byteLength(json, 'utf8')

  data = JSON.parse(json)
  cache.set(data)

  debug('read from disk path="%s" size=%d', path, size)

  return data
}

function write (data) {
  var json

  try {
    json = JSON.stringify(data)
  } catch (error) {
    debug('write username="%s" version=%d error="json" detail="%s"',
      data.metadata.username, data.metadata.version, error.message)

    throw error
  }

  const path = pathTo(data.metadata.username)
  const size = Buffer.byteLength(json, 'utf8')

  debug('write username="%s" version=%d path="%s" size=%d',
    data.metadata.username,
    data.metadata.version,
    path, size)

  if (size > MAX_DATA_SIZE_JSON) {
    throw new Error('data too large')
  }

  cache.set(data.metadata.username, data)

  fs.writeFileSync(path, json, 'utf8')
  
  debug('wrote json="%s" to path="%s"', json, path)
}

server.listen(port, function () {
  debug('socket.io server listening at port %d', port)
})

io.on('connection', function (socket) {
  var username
  const watches = {}       // targetUsername

  socket.on('signup', function () {
    username = _.kebabCase(bandname().toLowerCase())

    debug('signup username="%s"', username)

    write({
      metadata: {
        username,
        version: 0,
        collaborators: [],
        createdAt: new Date()
      },
      userdata: {}
    })

    const token = jwt.sign(username, JWT_SECRET)

    socket.emit('auth', username, token)
  })

  socket.on('auth', function (token) {
    try {
      username = jwt.verify(token, JWT_SECRET)
      socket.emit('auth', username, token)
    } catch (error) {
      debug('invalid token: %s', error)
    }
  })

  socket.on('update', function (changes, target, patch) {
    debug('update', changes, target,patch)
    try {
      target = target || username
      const existing = read(target)
      checkAccess(username, existing)
      checkVersion(existing, _.get(changes, 'metadata.version'))
      update(username, existing, changes, patch)
      write(existing)
      notifyChanges(existing)
      socket.emit('version', target, existing.metadata.version)
    } catch (error) {
      socket.emit('issue', error.message)
    }
  })

  socket.on('fetch', function (target, fields) {
    try {
      target = target || username
      debug('fetch', target, fields)
      const existing = read(target)
      checkAccess(username, existing)
      const data = pick(existing, fields)
      debug('fetch data username="%s"', target, 
        fields || '*', data)
      socket.emit('data', target, data)
    } catch (error) {
      socket.emit('issue', error.message)
    }
  })

  socket.on('watch', function (target, fields) {
    try {
      target = target || username
      const existing = read(target)
      checkAccess(username, existing)
      addWatcher(socket, target, fields, username)
      watches[target] = 1
    } catch (error) {
      socket.emit('issue', error.message)
    }
  })

  socket.on('unwatch', function (target) {
    try {
      target = target || username
      const existing = read(target)
      checkAccess(username, existing)
      removeWatcher(socket, target)
      _.unset(watches, target)
    } catch (error) {
      socket.emit('error', error.message)
    }
  })

  socket.on('disconnect', function () {
    _.each(watches, username => removeWatcher(socket, username))
  })
})

function checkAccess (username, data) {
  debug('checking access on "%s" for "%s"',
    data.metadata.username, username)

  if (username === data.metadata.username) {
    debug('owner access username="%s"', data.metadata.username)
    return true
  }

  if ((data.metadata.collaborators || []).indexOf(username) !== -1) {
    debug('foreign access username="%s" collaborator="%s"',
      data.metadata.username, username)
    return true
  }

  debug('access denied username="%s" requestor="%s"',
    data.metadata.username, username)

  throw new Error('unauthorized')
}

function checkVersion (data, version) {
  debug('checking version username="%s" expected=%d got=%d',
    data.metadata.username, data.metadata.version, version)

  if (version !== data.metadata.version) {
    throw new Error('version mismatch')
  }
}

function update (modifier, existing, changes, patch) {
  // Can replace or patch user data

  if (_.has(changes, 'userdata')) {
    if (patch) {
      Object.assign(existing.userdata, changes.userdata)
    } else {
      existing.userdata = changes.userdata
    }
  }

  // Can replace collaborators

  const collab = changes.metadata.collaborators
  if (Array.isArray(collab)) {
    existing.metadata.collaborators = _.uniq(collab)
  }

  // Always update metadata

  existing.metadata.version++
  existing.metadata.lastUpdate = { at: new Date(), by: modifier }
}

function pick (data, fields) {
  if (_.isEmpty(fields)) return data

  const values = {}

  _.each(fields, field => {
    return _.set(values, field, _.get(data.userdata, field))
  })

  return {
    metadata: data.metadata,
    userdata: values
  }
}

const watchers = {}  // username => [{socket, fields}]

function removeWatcher (socket, username) {
  _.remove(watchers[username], {socket})

  if (_.isEmpty(watchers[username])) {
    _.unset(watchers, username)
  }
}

function addWatcher (socket, username, fields, watcher) {
  const entry = {socket, fields, watcher}

  if (!_.has(watchers, username)) {
    watchers[username] = [entry]
  } else {
    watchers[username].push(entry)
  }
  
  debug('"%s" is watching "%s"', watcher, username)
}

function notifyChanges (existing) {
  const target = existing.metadata.username

  debug('notifying watchers of change to "%s"', target)

  _.each(watchers[target], function ({ socket, fields, watcher }) {
    debug('notifying watcher "%s" of change to "%s"', watcher, target)
    socket.emit('change', target, pick(existing, fields))
  })
}
