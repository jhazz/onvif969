var serverOptions={
  'host': '0.0.0.0',
  'docroot':'http',
  'port': 8888,
}


console.log('hello!')
const fs = require('fs')
const url = require('url')
const path = require('path')
const http = require('http')
const websocket=require('ws')

var mainWindow
nw.Window.open('http/index.html', {}, function(new_win) {
  mainWindow = new_win;
  mainWindow.width=1180
});
//nw.Window.get().showDevTools()

function testlab_log(data){
  mainWindow.window.postMessage(JSON.stringify({msg:'log', data:data}),'*');
}

var http_server, http_wss
var routes = {}
var eventSubscriptions={}
var eventSubscriptionLastId

const mimeTypes = {
  '.css' : 'text/css',
  '.html': 'text/html',
  '.js'  : 'text/javascript',
  '.jpg' : 'image/jpeg',
  '.ico' : 'image/x-icon'
}

setTimeout(function(){
  start ()
}, 500)
//-------------------------------------------

function start() {
  console.log('Server title:',serverOptions.title)
  console.log('Serving http://' + serverOptions.host + ':' + serverOptions.port + '/  on docroot=',serverOptions.docroot)
  try{
    http_server = http.createServer(onRequest)
    http_server.listen(serverOptions.port, serverOptions.host, () => {
      console.log('Started http server');
      http_wss = new websocket.Server({ server: http_server })
      http_wss.on("connection", function connection(ws) {
        ws.on("message", onWebsocketMessage)
      });
    });
  } catch (e){
    console.error('Невозможно запустить сервер',e)
  }
}

function onWebsocketMessage(wsmsg){
  var jsonmsg=JSON.parse(wsmsg)
  switch(jsonmsg.cmd){
    case 'logdata':
      var filename=jsonmsg.filename
      if (('filename' in jsonmsg) && ('data' in jsonmsg) ) {
        fs.writeFile(jsonmsg.filename, jsonmsg.data, function (err) {
          if (err) 
            return console.log(err);
          console.log('Лог сохранен в '+jsonmsg.filename);
        });        
      }
      nw.Shell.showItemInFolder(filename)
      break;
  }
  
}

function onRequest(req, res) {
  var u = url.parse(req.url);
  var mimeType, ext;

  console.log('Requested:', u.path, 'method:', req.method, ' to ',req.client.localAddress+':'+req.client.localPort,'<=',req.client.remoteAddress+':'+req.client.remotePort);

  var elements = u.path.split('/', 2);
  var p = elements[1];

  let safeSuffix = path.normalize(u.path).replace(/^(\.\.[\/\\])+/, '');
  let fileLoc = path.join(serverOptions.docroot, safeSuffix);

  console.log('Reading path:', fileLoc);

  fs.access(fileLoc, fs.constants.R_OK, (err) => {
    if (err) {
      // Путь не найден
      console.log(err);
      if (err.code == 'ENOENT') {
        res.writeHead(404, 'Not Found ');
        res.write('404: Not found ' + req.url);
      } else {
        res.writeHead(404, 'Not Found ');
        res.write('404: Not found ' + req.url + ' Error:' + err.code);
      }
      return res.end();
    }

    // путь найден
    fs.stat(fileLoc, (err, stats) => {
      if (err) {
        res.writeHead(503, 'Нет доступа к файлу');
        res.write('503: Metadata not accessible! ' + fileLoc);
        return res.end();
      }
      if (stats.isDirectory()) {
        console.log('Указанный путь является папкой');
        fileCandidate = path.join(fileLoc, 'index.html');
        fs.access(fileCandidate, fs.constants.R_OK, (err) => {
          if (err) {
            res.writeHead(404, 'Not Found ');
            res.write('404: Path has no index found! ' + fileLoc);
            return res.end();
          }

          fs.stat(fileCandidate, (err, stats) => {
            if (err) {
              res.writeHead(404, 'Not Found');
              res.write('404: Index file is not accessible at ' + fileLoc);
              return res.end();
            }

            fs.readFile(fileCandidate, (err, data) => {
              if (err) {
                res.writeHead(404, 'Not Found');
                res.write('404: Не могу прочитать индексный файл по пути ' + fileLoc);
                return res.end();
              }
              res.statusCode = 200;
              res.write(data);
              return res.end();
            });
          });
        });
      } else { 
        // если не isDirectory()
        if (!stats.isFile()) {
          res.writeHead(404, 'Not Found');
          res.write('404: Путь не является файлом ' + fileLoc);
          return res.end();
        }
          fs.readFile(fileLoc, function (err, data) {
            if (err) {
              res.writeHead(404, 'Not Found');
              res.write('404: Не найден файл по пути ' + fileLoc);
              return res.end();
            }
            ext = path.extname(fileLoc);
            mimeType = mimeTypes[ext];
            res.writeHead(200, { 'Content-Type': mimeType });
            return res.end(data);
          })
      }  // если не isDirectory()
    })  //fs.stat
  }) //fs.access
}



