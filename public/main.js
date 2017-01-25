$(function() {
  var username
  
  var $username = $('#username')
  var $userdata = $('#userdata')
  var $status = $('#status')
  
  var $watchUsername = $('#watch-username')
  var $watchUserdata = $('#watch-userdata')
  
  var hideStatusTimeout
  
  function status(what, isError) {
    $status.text(what).show()  
    
    if (isError) $status.addClass('error')
    else $status.removeClass('error')
    
    console.log(what)
    
    clearTimeout(hideStatusTimeout)
    hideStatusTimeout = setTimeout(function () {
      $status.hide()
    }, 5000)
  }
  
  status('connecting...')
  
  var socket = io()
  
  $('#signup').on('click', function () {
    status('Signing up...')    
    socket.emit('signup')
  })

  $('#me').on('click', function () {
    $username.val(username)
  })

  $('#fetch').on('click', function () {
    status('fetching...')
    socket.emit('fetch', $username.val())
  })

  $('#replace').on('click', function () {
    status('replacing...')
    socket.emit('update', JSON.parse($userdata.val()), $username.val())
  })

  $('#patch').on('click', function () {
    status('patching...')
    var json
    try {
      json = JSON.parse($userdata.val())
    } catch (error) {
      status('JSON is invalid')
      return
    }
    socket.emit('update', json, $username.val(), true)
  })

  $('#watch').on('click', function () {
    status('watching...')
    socket.emit('watch', $watchUsername.val())
  })

  $('#unwatch').on('click', function () {
    status('unwatching...')
    socket.emit('unwatch', $watchUsername.val())
  })
  
  socket.on('connect', function () {
    status('connected to backend.')
    
    if (localStorage.token) {
      status('authenticating with stored token')
      socket.emit('auth', localStorage.token)
    }
  })

  socket.on('disconnect', function () {
    status('disconnected')
  })
  
  socket.on('auth', function (username, token) {
    status('authenticated as "' + username + '"')
    $username.val(username)
    localStorage.token = token
    socket.emit('fetch')
  })
  
  socket.on('version', function (username, version) {
    status('Username "' + username + '" has version ' + version)
    try {
      var data = JSON.parse($userdata.val())
      console.log(data, data.metadata, username)
      if (data.metadata && data.metadata.username == username) {
        data.metadata.version = version;
        console.log('updating userdata with discovered version', version)
        $userdata.val(JSON.stringify(data, ' ', 2))
      }
    } catch (error) {
      // nop
    }
  })
  
  socket.on('issue', function (message) {
    status(message, true)
    console.error(message)
  })
  
  socket.on('data', function (username, data) {
    status('fetched data for "' + username + '"')
    $username.val(username)
    var json = JSON.stringify(data, ' ', 2)
    $userdata.val(json)
  })
  
  socket.on('change', function (username, data) {
    status('got change for ' + username)
    $watchUsername.val(username)
    $watchUserdata.val(JSON.stringify(data, ' ', 2))
  })
});