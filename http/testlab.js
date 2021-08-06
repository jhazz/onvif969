function OnvifAgent(addr, user, pass){
  this.properties={
    addr:{value:addr, title:'Адрес устройства'},
    user:{value:user, title:'Логин'},
    pass:{value:pass, title:'Пароль'},
    TZ:{value:'', title:'Часовой пояс'},
    UTCHour:{value:'', title:'Мировой час'},
    LocalHour:{value:'', title:'Локальный час'},
    UTCMinute:{value:'', title:'Минуты'},
    UTCSecond:{value:'', title:'Секунды'},
    Year:{value:'', title:'Год'},
    Month:{value:'', title:'Месяц'},
    Day:{value:'', title:'День'},
    XAddrDevice:{value:'', title:'Адрес сервиса событий'},
    WSPullPointSupport:{value:'', title:'Наличие подсистемы подписки на события WSPullPointSupport', important:1},
    XAddrDevice2:{value:'', title:'Адрес сервиса параметров устройства, полученный при запросе совместимостей'},
    XAddrEvents:{value:'', title:'Адрес сервиса событий устройства', important:1},
    XAddrImaging:{value:'', title:'Адрес сервиса изображений устройства'},
    XAddrMedia :{value:'', title:'Адрес сервиса управления медиа устройства', important:1},
    XAddrRecording:{value:'', title:'Адрес сервиса управления архивом устройства'},
    XAddrDeviceIO:{value:'', title:'Адрес сервиса управления вводом-выводом устройства'},
    VideoSourcesCount:{value:'', title:'Число источников видео', important:1},
    VideoOutputs:{value:'', title:'Число получателей видео'},
    TopicMotionAlarm:{title:'Топик движения MotionAlarm', type:'topic'},
    TopicCellMotionDetector:{title:'Топик обнаружение движения в сетке зон детекции', type:'topic'},
    VideoSources:{title:'Видеоисточники', type:'videosources'},
    XAddrPullPoint:{title:'Адрес получения событий, на которые подписан', important:1},
    NotificationMessages:{title:'Сообщение о тревоге движения',type:'messages'},
  }
}

OnvifAgent.prototype.requestNamespaces = {
  s:  "http://www.w3.org/2003/05/soap-envelope",   
  tds:"http://www.onvif.org/ver10/device/wsdl",
  tt: "http://www.onvif.org/ver10/schema",
  trt: 'http://www.onvif.org/ver10/media/wsdl',
  tev:"http://www.onvif.org/ver10/events/wsdl",
  tns1:"http://www.onvif.org/ver10/topics",
  wstop:"http://docs.oasis-open.org/wsn/t-1",
  wsnt:"http://docs.oasis-open.org/wsn/b-2",
  wsa5:"http://www.w3.org/2005/08/addressing",
  wsa:"http://schemas.xmlsoap.org/ws/2004/08/addressing",
  wsse:"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
}; 

// возвращает наличие проблемы
// 0|1|2 (0 - все ок, 1 - необязательный параметр отсутствует, 2 - отсутствует важный параметр)
OnvifAgent.prototype.extractPropertyFromResponse=function(request, attrName, path) {
  var self=this
  function _getXMLByPath(xml, path){
    return xml.evaluate(path, xml, 
     function (prefix) {
       // используем пространство имен ответа, и своего запроса
       if(!!self.requestNamespaces[prefix]) {
         return self.requestNamespaces[prefix]
       }
       if (!!request.responseNS[prefix]) {
         return request.responseNS[prefix]
       }
       console.error ('Обнаружен неизвестный префикс пространства имен:', prefix)
     },
     XPathResult.FIRST_ORDERED_NODE_TYPE,null
     ).singleNodeValue;
  }

  var v=_getXMLByPath(request.responseXML, path)
  var nodeTitle=this.properties[attrName].title
  var type=this.properties[attrName].type
  
  if(v==null) {
    this.properties[attrName].value=undefined
    var el=document.createElement('span')
    el.className='warning'
    el.innerText=nodeTitle+'(не определен)'
    request.elExtracted.appendChild(el)
    lab.log('Параметр устройства: '+nodeTitle+'('+attrName+') не определен!')
  } else {
    switch (type){
      case 'videosources':
        var sources=v.getElementsByTagName('trt:VideoSources')
        self.properties.videosourcesByToken={}
        for (i=0;i<sources.length;i++) {
          var el=sources[i]
          var vstoken=el.getAttribute('token')
          var vsframeRate=el.getElementsByTagNameNS(self.requestNamespaces['tt'],'Framerate')[0].textContent
          var vsres=el.getElementsByTagNameNS(self.requestNamespaces['tt'],'Resolution')[0]
          var vswidth =parseInt(vsres.getElementsByTagNameNS(self.requestNamespaces['tt'],'Width')[0].textContent)
          var vsheight=parseInt(vsres.getElementsByTagNameNS(self.requestNamespaces['tt'],'Height')[0].textContent)
          self.properties.videosourcesByToken[vstoken]={
            frameRate:vsframeRate,
            width:vswidth,
            height:vsheight
          }
          var el=document.createElement('span')
          el.innerText=nodeTitle+'['+vstoken+']='+vswidth+'x'+vsheight+'@'+vsframeRate+' ';
          request.elExtracted.appendChild(el)
          lab.log('Видеоисточник['+vstoken+']='+vswidth+'x'+vsheight+'@'+vsframeRate)
        }
        return 0
        
      case 'messages':
        var notificationMessages=v.getElementsByTagNameNS(self.requestNamespaces['wsnt'],'NotificationMessage')
        if(notificationMessages.length==0){
          lab.log('Ответ не содержит сообщений NotificationMessage')
          return 1
        } else {
          var el, str, notificationMessage, Message, MessageContent, i, Source, state, SimpleItem, Data, src, UTCTime, Topic, t
          
          if (request.passedFirst==undefined) {
            request.passedFirst=false
            lab.log('Первый ответ с сообщениями игнорируется как изменение. Фиксируется лишь последнее состояние!')
            request.isReceivedChanges=false
          }
          
          for (i=0;i<notificationMessages.length;i++){
            notificationMessage=notificationMessages[i]
            Topic=notificationMessage.getElementsByTagNameNS(self.requestNamespaces['wsnt'],'Topic')[0]
            t=Topic.textContent
            Message=notificationMessage.getElementsByTagNameNS(self.requestNamespaces['wsnt'],'Message')[0]
            MessageContent=Message.getElementsByTagNameNS(self.requestNamespaces['tt'],'Message')[0]
            UTCTime=MessageContent.getAttribute('UtcTime')
            Source=MessageContent.getElementsByTagNameNS(self.requestNamespaces['tt'],'Source')[0]
            SimpleItem=Source.getElementsByTagNameNS(self.requestNamespaces['tt'],'SimpleItem')[0]
            src=SimpleItem.getAttribute('Value')
            Data=MessageContent.getElementsByTagNameNS(self.requestNamespaces['tt'],'Data')[0]
            SimpleItem=Data.getElementsByTagNameNS(self.requestNamespaces['tt'],'SimpleItem')[0]
            state=SimpleItem.getAttribute('Value')
            if(!this.properties.states) {
              this.properties.states={}
            }
            
            el=document.createElement('span')
            el.style.display='block'
            if (!request.passedFirst) {
              el.style.textDecoration='line-through'
            }
            str=UTCTime+'-('+src+'<-'+t+')='+state
            lab.log(str)
            el.innerText=str
            request.elExtracted.appendChild(el)
            
             if(!request.passedFirst){
              this.properties.states[src+'@'+t]=state
              lab.log('Фиксируется состояние триггера из первого сообщения['+src+']'+t+' в '+state)
            } else {
              if (this.properties.states[src+'@'+t]!==state){
                request.isReceivedChanges=true
                lab.log('Успешно обнаружено изменение состояния! ['+src+']'+t+'  изменилось с ' + this.properties.states[src+'@'+t] + ' на '+state)
                lab.log('Тест уже можно считать пройденным!')
                this.properties.states[src+'@'+t]=state
              }
            }
            
          }
          
          if (!request.passedFirst) {
            lab.log('Первый ответ пропущен. Ждем изменений! ')
            el=document.createElement('hr')
            request.elExtracted.appendChild(el)
            el=document.createElement('div')
            el.innerHTML='<h3>Проведите рукой над камерой!</h3>'
            request.elExtracted.appendChild(el)
          }
          request.passedFirst=true
        }
        return 0
      
      case 'topic': 
        var MessageDescription=v.getElementsByTagNameNS(self.requestNamespaces['tt'],'MessageDescription')
        if ((!MessageDescription.length) || (MessageDescription[0].getAttribute('IsProperty')!='true')) {
          lab.log('Топик не содержит описание сообщения: '+path)
          break;
        }
        var Data=MessageDescription[0].getElementsByTagNameNS(self.requestNamespaces['tt'],'Data')
        var SimpleItemDescription=Data[0].getElementsByTagNameNS(self.requestNamespaces['tt'],'SimpleItemDescription')
        var t=this.properties[attrName].topic={
          itemName: SimpleItemDescription[0].getAttribute('Name'),
          itemType: SimpleItemDescription[0].getAttribute('Type')
        }
        var el=document.createElement('span')
        el.innerText=nodeTitle+': '+t.itemName + '('+t.itemType+')'
        request.elExtracted.appendChild(el)
        lab.log('Параметр устройства: '+nodeTitle)
        lab.log(path +' == '+t.itemName + '('+t.itemType+')')
        return 0
      default:
        var strValue=v.textContent
        this.properties[attrName].value=strValue
        var el=document.createElement('span')
        el.innerText=nodeTitle+': '+strValue+''
        request.elExtracted.appendChild(el)
        lab.log('Параметр устройства: '+nodeTitle+'('+attrName+')='+strValue)      
        return 0
    }
  }
  
  if(this.properties[attrName].important) {
      return 2
    } else {
      return 1
    }

}

//  params:
//  param.xmlns{} | requestNSList[]
//  param.user
//  param.pass
//  param.diff
OnvifAgent.prototype.makeOnvifRequestText = function(request){
	var s= '<?xml version="1.0" encoding="UTF-8"?><s:Envelope '
	
  if(request.action || request.to){
    if (request.requestNSList.indexOf('wsa')==-1) {
      request.requestNSList.push('wsa')
    }
  }
  if(!!request.requestNSList){
    for (var i in request.requestNSList) {
      var nsPrefix=request.requestNSList[i]
      s+= "\n xmlns:" + nsPrefix + '="'+ this.requestNamespaces[nsPrefix] + '"'
    }
  }
	s+= '><s:Header>';
  var user=request['user'], diff=request['diff'], pass=request['pass']
	if(user) {
		//s+=this._createSoapUserToken(request['diff'], request['user'], request['pass']);
    if(!diff) {diff = 0;}
    if(!pass) {pass = '';}
    var date = (new Date(Date.now() + diff)).toISOString();
    var nonce_buffer = createNonce(16);
    var nonce_base64 = nonce_buffer.toString('base64');
    var shasum = CryptoJS.algo.SHA1.create()
    shasum.update(CryptoJS.lib.WordArray.create(Buffer.concat([nonce_buffer, new Buffer(date), new Buffer(pass)])))
    var digest = shasum.finalize().toString(CryptoJS.enc.Base64)
    s+='<Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
    +'  <UsernameToken>'
    +'    <Username>' + user + '</Username>'
    +'    <Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">' + digest + '</Password>'
    +'    <Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' + nonce_base64 + '</Nonce>'
    +'    <Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">' + date + '</Created>'
    +'  </UsernameToken>'
    +'</Security>';
	}
  if(request.action){
      s+='<wsa:Action>'+request.action+'</wsa:Action>'
  }
  if(request.to){
      s+='<wsa:To>'+request.to+'</wsa:To>'
  }
	s+='</s:Header><s:Body>' + request['body'] + '</s:Body></s:Envelope>';  
  return s
}

OnvifAgent.prototype.sendRequest=function(request, resolve, reject){
  var self=this
  var text=request.elInputRequest.innerText
  var t=new Date()
  lab.soapLog.push(t.toLocaleDateString()+'_'+t.toLocaleTimeString()+' -- Отправляю на '+request.servicePath)
  lab.soapLog.push(text)
  
  var hasImportantError=0
  
  request.xhr=sendXML(request.servicePath, text, function(data, isError){
    if(!isError) {
      request.elInputResponse.innerText=data
      var t=new Date()
      lab.soapLog.push(t.toLocaleDateString()+'_'+t.toLocaleTimeString()+' -- Получен ответ:')
      lab.soapLog.push(data)
      lab.soapLog.push('============================================================================')
      request.responseXML = (new DOMParser()).parseFromString(data, "application/xml");
      
      request.responseNS={}
      var i,ns,reqUri,responsePrefix
      for (i in request.requestNSList) {
        ns=request.requestNSList[i]
        reqUri=self.requestNamespaces[ns]
        responsePrefix=request.responseXML.lookupPrefix(reqUri)
        request.responseNS[responsePrefix]=reqUri
      }
      
      for(var name in request.extractingResponseProperties){
        var err=request.agent.extractPropertyFromResponse(request, name, request.extractingResponseProperties[name])
        if (err==2){
          hasImportantError++
          lab.log('ВНИМАНИЕ! Важный параметр устройства "'+name+'" отсутствует в ответе! ')
          lab.log(request.extractingResponseProperties[name])
        }
        if(err==1) {
          //lab.log('Необязательный параметр "'+name+'" отсутствует в ответе')
        }
      }
      if(hasImportantError) reject(request); else resolve(request)
    } else {
      reject(request)
    }
    
    
  }, 'application/soap+xml; charset=utf-8;')
}

OnvifAgent.prototype.prepareGetSystemDateAndTime=function(){
  
  var request={
      agent:this,
      body:'<tds:GetSystemDateAndTime/>',
      servicePath:this.properties.addr.value+'/onvif/device_service',
      requestNSList:['s','tds','tt'],
      extractingResponseProperties:{
      'TZ':'/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:TimeZone/tt:TZ',
      'UTCHour':'/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:UTCDateTime/tt:Time/tt:Hour',
      'LocalHour':'/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:LocalDateTime/tt:Time/tt:Hour',
      'UTCMinute':'/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:UTCDateTime/tt:Time/tt:Minute',
      'UTCSecond':'/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:UTCDateTime/tt:Time/tt:Second',
      'Year': '/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:UTCDateTime/tt:Date/tt:Year',
      'Month': '/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:UTCDateTime/tt:Date/tt:Month',
      'Day': '/s:Envelope/s:Body/tds:GetSystemDateAndTimeResponse/tds:SystemDateAndTime/tt:UTCDateTime/tt:Date/tt:Day'
      }
    }
  request.requestText=this.makeOnvifRequestText(request)
  return request
}

OnvifAgent.prototype.prepareGetCapabilities=function(resolve, reject){
  var request={
      agent:this,
      body:'<tds:GetCapabilities/>',
      servicePath:this.properties.addr.value+'/onvif/device_service',
      requestNSList:['s','tds','tt'],
      extractingResponseProperties:{
        'XAddrDevice'  :'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Device/tt:XAddr',
        'XAddrEvents'  :'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Events/tt:XAddr',
        'WSPullPointSupport':'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Events/tt:WSPullPointSupport',
        'XAddrImaging' :'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Imaging/tt:XAddr',
        'XAddrMedia'   :'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Media/tt:XAddr',
        'XAddrDeviceIO':'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Extension/tt:DeviceIO/tt:XAddr',
        'XAddrRecording':'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Extension/tt:Recording/tt:XAddr',
        'VideoSourcesCount' :'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Extension/tt:DeviceIO/tt:VideoSources',
        'VideoOutputs' :'/s:Envelope/s:Body/tds:GetCapabilitiesResponse/tds:Capabilities/tt:Extension/tt:DeviceIO/tt:VideoOutputs',
      }
    }
  request.requestText=this.makeOnvifRequestText(request)
  return request
}



OnvifAgent.prototype.prepareGetVideosources=function(){
  var p=this.properties.XAddrMedia.value
  if(!p) {
    alert('Сначала надо получить данные о возможностях устройства!')
    return
  }
  var request={
      agent:this,
      user:this.properties.user.value,
      pass:this.properties.pass.value,
      body:'<GetVideoSources xmlns="http://www.onvif.org/ver10/media/wsdl"/>',
      action:'http://www.onvif.org/ver10/media/wsdlGetVideoSources/',
      servicePath: p,
      requestNSList:['s','tt','trt'],
      extractingResponseProperties:{
        'VideoSources' : '/s:Envelope/s:Body/trt:GetVideoSourcesResponse'
      }
    }
  request.requestText=this.makeOnvifRequestText(request)
  return request
}


OnvifAgent.prototype.prepareGetEventProperties=function(){
  var p=this.properties.XAddrEvents.value
  if(!p) {
    alert('Сначала надо получить данные о возможностях устройства!')
    return
  }
  var request={
      agent:this,
      user:this.properties.user.value,
      pass:this.properties.pass.value,
      body:'<tev:GetEventProperties/>',
      servicePath: p,     //'/onvif/device_events',
      requestNSList:['s','tds','tt','tev','tns1','wstop'],
      extractingResponseProperties:{
        'TopicMotionAlarm'  :'/s:Envelope/s:Body/tev:GetEventPropertiesResponse/wstop:TopicSet/tns1:VideoSource/MotionAlarm',
        'TopicCellMotionDetector' :'/s:Envelope/s:Body/tev:GetEventPropertiesResponse/wstop:TopicSet/tns1:RuleEngine/CellMotionDetector/Motion',
      }
    }
  request.requestText=this.makeOnvifRequestText(request)
  return request
}



OnvifAgent.prototype.createPullPointSubscription=function(){
  var p=this.properties.XAddrEvents.value
  if(!p) {
    alert('Сначала надо получить данные о возможностях устройства!')
    return
  }
  var request={
      agent:this,
      user:this.properties.user.value,
      pass:this.properties.pass.value,
      body:'<tev:CreatePullPointSubscription xmlns="http://www.onvif.org/ver10/events/wsdl"> \
        <InitialTerminationTime>PT60S</InitialTerminationTime> \
        </tev:CreatePullPointSubscription>',  // жить будет 1 минуту
      servicePath: p,
      requestNSList:['s','tds','tt','tev', 'wsa5'],
      extractingResponseProperties:{
        'XAddrPullPoint' :'/s:Envelope/s:Body/tev:CreatePullPointSubscriptionResponse/tev:SubscriptionReference/wsa5:Address',
      }
    }
  request.requestText=this.makeOnvifRequestText(request)
  return request
}



OnvifAgent.prototype.pullMessages=function(){
  var p=this.properties.XAddrPullPoint.value
  if(!p) {
    alert('Сначала надо подписаться на события!')
    return
  }
  var request={
      agent:this,
      user:this.properties.user.value,
      pass:this.properties.pass.value,
      action:'http://www.onvif.org/ver10/events/wsdl/PullPointSubscription/PullMessagesRequest',
      to:p,
      body:'<PullMessages xmlns="http://www.onvif.org/ver10/events/wsdl">\
      <Timeout>PT5S</Timeout><MessageLimit>10</MessageLimit>\
      </PullMessages>',
      servicePath: p,
      requestNSList:['s','tds','tt','tev','wsnt'],
      extractingResponseProperties:{
        'NotificationMessages': '/s:Envelope/s:Body/tev:PullMessagesResponse'
        //'RuleEngine/CellMotionDetector/Motion': '/s:Envelope/s:Body/tev:PullMessagesResponse/wsnt:NotificationMessage/',
      }
    }
  request.requestText=this.makeOnvifRequestText(request)
  return request
}


OnvifAgent.prototype.createUnsubscribeRequest=function(){
  var p=this.properties.XAddrPullPoint.value
  if(!p) {
    alert('Сначала надо подписаться на события!')
    return
  }
  var request={
      agent:this,
      user:this.properties.user.value,
      pass:this.properties.pass.value,
      action:'http://docs.oasis-open.org/wsn/bw-2/SubscriptionManager/UnsubscribeRequest',
      to:p,
      body:'<wsnt:Unsubscribe/>',
      servicePath: p,
      requestNSList:['s','tds','tt','tev', 'wsa','wsnt'],
      extractingResponseProperties:{}
    }
  request.requestText=this.makeOnvifRequestText(request)
  return request
}



// ===============================================
var lab={
  logContainer:null,
  bedContainer:null,
  agent:null,
  agents:[],
  setLogContainer:function(el){this.logContainer=el},
  setBedContainer:function(el){this.bedContainer=el},
  steps:[],
  soapLog:[],
  
  log:function (data){
    var t=new Date()
    var s=t.toLocaleDateString()+'_'+t.toLocaleTimeString()+' -- '
    if(typeof(data)=='string') {
      s+=data
    } else {
      s+=JSON.stringify(data)
    }
    var el=document.createElement('pre')
    el.innerText=s
    this.logContainer.appendChild(el)
    document.getElementById('saveLog').style.display='block'
  },
  
  start:function(addr, user, pass){
    lab.ws = new WebSocket('ws://127.0.0.1:8888')
    lab.ws.onmessage =function(event){
      console.log('Websocket: Received' ,event.data)
    }
    if(lab.agent!=null) {
      lab.agents.push(agent)
    }
    addr='http://'+addr
    lab.agent=new OnvifAgent(addr, user, pass)
    lab.currentStepNo=0;
    lab.steps=[{title:'1.Получение системного времени', prepare:lab.agent.prepareGetSystemDateAndTime},
      {title:'2.Перечень возможностей', prepare:lab.agent.prepareGetCapabilities},
      {title:'3.Список видеоисточников', prepare:lab.agent.prepareGetVideosources},
      {title:'4.Получение данных о топиках событий', prepare:lab.agent.prepareGetEventProperties},
      {title:'5.Подписка на события', prepare:lab.agent.createPullPointSubscription},
      {title:'6.Чтение событий', prepare:lab.agent.pullMessages, repeatSeconds:60},
      {title:'7.Отписаться от событий', prepare:lab.agent.createUnsubscribeRequest}
    ]    
    var inp, step, el, menuTopEl=document.getElementById('topMenu')
    for (var i in lab.steps){
      step=lab.steps[i]
      inp=document.createElement('input')
      inp.setAttribute('type','checkbox')
      inp.className='topMenuItem'
      step.inputEl=inp
      menuTopEl.appendChild(inp)
      
      var label=document.createElement('label')
      menuTopEl.appendChild(label)
      
      var labelText=document.createElement('span')
      labelText.innerText=step.title
      labelText.className='menuItemLabel';
      label.appendChild(labelText);
      (function(){
        var s=step
        labelText.addEventListener('click',function(e){
          //alert(s.title)
          if (!!s.elInputResponse){
            s.elInputResponse.focus()
          }
        })
      })();
    }
    lab.iterateStep()
  },
  
  iterateStep:function(){
    window.setTimeout(lab.onIterateStep,0)
  },

  setStepPassed:function(step){
      step.inputEl.checked=true
  },
  
  onIterateStep:function(){
    var step=lab.steps[lab.currentStepNo]
    lab.log('=====================================')
    lab.log('Выполняется шаг ['+(lab.currentStepNo+1)+']' +step.title)
    lab.log('')
    var request=step.prepare.call(lab.agent)
    request.stepNo=lab.currentStepNo
    lab.addTestStep(step, request, lab.onStepSuccess, lab.onStepFail)
  },
  
  onStepSuccess:function(request){
    var el=document.createElement('div')
    var step=lab.steps[lab.currentStepNo]
    el.className='success'
    el.innerText='Тестовый шаг пройден успешно'
    request.elExtracted.appendChild(el)
    lab.log('Шаг ['+(lab.currentStepNo+1)+'] выполнен: '+step.title)
    if(request.done==undefined){
      request.done=1
      lab.setStepPassed(step)
      if(lab.currentStepNo<(lab.steps.length-1)){
        lab.currentStepNo++
        lab.log('Переходим к следующему шагу ['+(lab.currentStepNo+1)+']')
        lab.iterateStep()
      }
    }
  },
  
  onStepFail:function (request){
    var el=document.createElement('div')
    var step=lab.steps[lab.currentStepNo]
    el.className='error'
    el.innerText='Тест не пройден!'
    request.elExtracted.appendChild(el)
    lab.log('Тест['+(lab.currentStepNo+1)+'] не выполнен! -- '+step.title)
  },

  addTestStep:function(step, request, resolve, reject){
    var testStep=document.createElement('fieldset')
    testStep.innerHTML='<legend>'+step.title
      +'</legend><table width="100%"><tr valign="top"><td width="50%">'
      +'<div class="inputBox" contentEditable="true"></div>'
      +'</td><td width="50%"><div class="inputBox" contentEditable="true"></div></td></tr><tr valign="top"><td>'
      +'<button>Отправить запрос</button></td><td class="tinyInfo"></td></tr></table>'
    lab.bedContainer.appendChild(testStep)
    request.elInputRequest=testStep.children[1].firstChild.firstChild.children[0].firstChild
    request.elInputResponse=testStep.children[1].firstChild.firstChild.children[1].firstChild
    request.elBtnSend=testStep.children[1].firstChild.children[1].firstElementChild.firstElementChild
    request.elExtracted=testStep.children[1].firstChild.children[1].children[1]
    request.elInputRequest.innerText=request.requestText
    step.elInputResponse=request.elInputResponse
    
    if(step.repeatSeconds) {
      request.elBtnSend.innerText='Запуск цикла на '+step.repeatSeconds+' секунд';
      (function(){ // делаем closure
        request.elBtnSend.addEventListener('click',function (e){
          step.startTime=new Date()
          request.elBtnSend.disabled = true
          if(step.jobObserver){
            lab.log('Попытка запустить задачу, когда задача уже запущена')
            return
          }
          request.elExtracted.innerHTML=''
          lab.log('Запуск периодического опроса событий ONVIF по адресу '+request.servicePath)
          step.jobObserver=window.setInterval(function(){
            lab.agent.sendRequest (request, function(request){
              lab.log('Получен ответ, в котором ожидаются сообщения')
              _checkObserver(request)
            }, function(request){
              lab.log('Ошибка в ответе')
              _checkObserver(request)
            })
            console.log('Состояние запроса', request.xhr)
          },1000)
        })
        request.elBtnSend.focus()
      })()
    } else {
      (function(){ // делаем closure
        request.elBtnSend.addEventListener('click',function (e){
          request.elBtnSend.disabled = true
          request.elExtracted.innerHTML=''
          lab.log('Отправляется ONVIF запрос на адрес '+request.servicePath)
          lab.agent.sendRequest (request, resolve, reject)
        })
        request.elBtnSend.focus()
      })()
    }
    
    
    
    function _checkObserver(request){
      if((new Date()-step.startTime)/1000 > step.repeatSeconds) {
        window.clearInterval(step.jobObserver)
        request.elBtnSend.innerText='Завершено'
        request.elBtnSend.disabled=false
        lab.log('Циклическое тестирование завершено')
        if(request.isReceivedChanges){
          lab.log('Переходим к следующему шагу')
          resolve(request) //onStepSuccess
        } else {
          lab.log('Среди полученных сообщений не было обнаружено изменение состояний триггеров событий, в том числе триггера обнаружения движения')
          reject(request)

        }
        // НАДО ПРОВЕРИТЬ, ЧТО БЫЛИ ПОЛУЧЕНЫ ДВИЖЕНИЯ!
        //lab.iterateStep()
      } else {
        var secondsLeft=step.repeatSeconds - Math.ceil((new Date()-step.startTime)/1000)
        request.elBtnSend.innerText='Осталось '+secondsLeft+' секунд'
      }
    }
  } // addTestStep
}

function saveLogToDisk(){
  var dlg=document.createElement('input'), d=new Date()
  dlg.type='file'
  dlg.setAttribute('nwsaveas','videolab_log_'+(d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()+'_'+d.getHours()+'-'+d.getMinutes())+'.txt')
  dlg.setAttribute('accept','*.txt')
  dlg.addEventListener('change',function(e){
    alert('Сохраняю в файл: \n'+dlg.value)
    lab.ws.send(JSON.stringify({
      cmd:'logdata', 
      filename:dlg.value, 
      data:document.getElementById('logContainer').innerText+'\n\n===========================\nSOAP обмен:'+lab.soapLog.join('\n')
    }))
  })
  dlg.click()
}

function createNonce(digit) {
  var nonce = new Buffer(digit);
  for(let i=0; i<digit; i++){
   nonce.writeUInt8(Math.floor(Math.random() * 256), i);
  }
  return nonce;
}

function sendXML(addr, requestString, onload, requestType, responseType) {
  if (!requestType) requestType = 'text/xml'
  if (!responseType) responseType = 'text'
  var xhr = new XMLHttpRequest();
  
  console.log('Отправляю SOAP-POST запрос на адрес:',addr)
  try{
    xhr.open('POST', addr)
  } catch(e){
    lab.log('ОШИБКА: Адрес неверен:'+addr)
    return;
  }
  xhr.responseType = responseType
  xhr.setRequestHeader('Content-type', requestType)
  xhr.send(requestString)
  xhr.onload = function (progress) {
    if (progress.target.status !== 200) {
      if(progress.target.status === 401) { 
        console.log('Получил 401 ! Требуется авторизация')
      }	
      return onload({ error: 'Ошибка подключения ' + progress.target.status, url: addr }, true)
    }
    if (progress.target.response === null) {
      return onload({ error: 'Ошибка обработки ответа от сервера', url: addr, json }, true)
    }
    if (progress.target.response=='<xml>error</xml>') {
      return onload(progress.target.response, true)
    }
    return onload(progress.target.response, false)
  };
  xhr.onerror = function (response) { return onload(response.target, true) };
  return xhr
}

function parseTpl(template, obj) {
  return template.replace(/\$\{.+?}/g, (match) => {
    const path = match.substr(2, match.length - 3).trim()
    return path.split('.').reduce((res, key) => (key in res)?res[key]:'', obj)
  });
}