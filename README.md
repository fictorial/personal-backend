# A simple backend for personal projects

This is a simple Socket.io server for getting, putting, patching JSON-encodable data on a per-user basis.

Allows users to add collaborators which have read/write access to the granter's data.  That's right!  A personal backend with collaboration!  I wrote this initially for a home inventory management app to be shared with my wife; so, kind of personal.

User data has a *version* number.  Clients specify the current version for updates.

Updates may be full replacements or patches/merges.

Clients can fetch or get the full data or just some paths therein (e.g. `a.b.c`).

Clients can watch for changes to a user's data (including their own) as long as they are the owner of the data or a collaborator thereof.

## UserData

    {
		"metadata": {
            "username": String,
            "version": Number,
            "collaborators": [Username],
            "createdAt": Date,
            "lastUpdate": { "at": Date, "by": Username }
        },
        "userdata": Object
    }
    
## Client Messages

    'signup'    
    'auth', token    
    'update', newData, version, targetUsername=null, patch=false    
    'fetch', targetUsername=null, fields=null
    'watch', targetUsername
    'unwatch', targetUsername

## Server Messages

    'auth', username, token    
    'version', username, version    
    'error', message    
    'data', targetUsername, data
    'change', targetUsername, data
    
## Error Messages

    'invalid token'
    'version mismatch'
    'unauthorized'
    
## Updates

    newData = {
      metadata: {
        version: int,             // expected server version of data
        collaborators: [String]   // replaces entirely regardless of patch
      },
      userdata: Object            // replacement or changes (for patch)
    }
    
## Fields

    fields = [
      'a.b',                      // {a: {b: 1}}
      'c',                        // {c: 'foo'}
      'd.e.f'
    ]
    
Fields are a poor man's GraphQL.  Specifying some fields to `fetch` or `watch` will only 
return some fields and the `data` in a `data` or `change` message from the server will 
take the same shape.

## Configuration

### ENV

    PORT=8080
    CACHE_SIZE=100
    CACHE_MAX_AGE=900000
    JWT_SECRET=...
    MAX_DATA_SIZE_JSON=65536
    DEBUG=api

## TODO

- Rate limit signups from the same IP but this is a cat and mouse game

## Author

Brian Hammond <brian@fictorial.com>
