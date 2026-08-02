

    class DataHelper{
        constructor(val=null){
            this.data=val?val:[];
            this.rpos=0;
            this.LE=true;
        }
        w32(v){
            if(this.LE){
                this.data.push((v>>0)&0xff);
                this.data.push((v>>8)&0xff);
                this.data.push((v>>16)&0xff);
                this.data.push((v>>24)&0xff);
            }
            else{
                this.data.push((v>>24)&0xff);
                this.data.push((v>>16)&0xff);
                this.data.push((v>>8)&0xff);
                this.data.push((v>>0)&0xff);
            }
            return this;
        }
        w16(v){
            if(this.LE){
                this.data.push((v>>0)&0xff);
                this.data.push((v>>8)&0xff);
            }
            else{
                this.data.push((v>>8)&0xff);
                this.data.push((v>>0)&0xff);
            }
            return this;
        }
        w8(v){
            this.data.push(v&0xff);
            return this;
        }
        align(pos){
            while(this.data.length<pos)this.data.push(0);
            return this;
        }
        wbuff(buff){
            buff.forEach(e=>this.data.push(e));
            return this;
        }

        bytes(){
            return this.data;
        }


        r8(){
            return this.data[this.rpos++];
        }
        r16(){
            let v=0;
            if(this.LE){
                v=this.data[this.rpos++];
                v|=this.data[this.rpos++]<<8;
            }
            else{
                v=this.data[this.rpos++]<<8;
                v|=this.data[this.rpos++];
            }
            return v;
        }
        r32(){
            let v=0;
            if(this.LE){
                v=this.data[this.rpos++];
                v|=this.data[this.rpos++]<<8;
                v|=this.data[this.rpos++]<<16;
                v|=this.data[this.rpos++]<<24;
            }
            else{
                v=this.data[this.rpos++]<<24;
                v|=this.data[this.rpos++]<<16;
                v|=this.data[this.rpos++]<<8;
                v|=this.data[this.rpos++];
            }
            return v;
        }
        rbuff(len){
            let v=[];
            while(len--)v.push(this.data[this.rpos++]);
            return v;
        }
        rappend(v,len){
            while(len--)v.push(this.data[this.rpos++]);
            return v;
        }
        rskip(len){
            this.rpos+=len;
            return this;
        }
        
    }

    class BLEUART{
        constructor(statschange=null,onrecvdata,filters=0xfff0,readservice=0xfff1,writeservice=0xfff2){
            if(!('bluetooth' in navigator))return;
            this.OnstatusChange=statschange?statschange:()=>{};
            this.OnReceiveData=onrecvdata?onrecvdata:()=>{};
            
            this.Sender=null;
            this.deviceName='';
            this.device=null;
            this.connected=false;
            this.Service=null;
            this.buffer=[];
            this.logs=[];
            this.filters=filters;
            this.readservice=readservice;
            this.writeservice=writeservice;

            this.rxFollowTx=true;
            this.rxReqCount=1;
            this.rxPromise=null;
            this.rxPromiseresolve=null;
            this.rxPromisereject=null;
            this.rxPromisecallback=null;
            this.timer=setInterval(() => {
                if(this.buffer.length>=this.rxReqCount)
                {
                    //this.OnReceiveData(this.buffer);
                    if(this.rxPromise){
                        if(this.buffer.length>=this.rxReqCount){
                            const buff=this.buffer.splice(0,this.rxReqCount);
                            this.rxPromiseresolve(this.rxPromisecallback(buff));
                            this.rxPromise=null;
                        }
                    }
                }
            }, 1);
        }
        log(obj){
            this.logs.push(obj.toString());
        }
        open(){
            if(this.connected){
                this.close();
                this.connected=false;
                this.OnstatusChange(this,false);
                return;
            }
            try{
                navigator.bluetooth.requestDevice({ filters: [{ services: [this.filters] }] })
                .then(device => {
                    this.log('Connecting...');
                    this.deviceName = device.name;
                    this.device = device;
                    device.addEventListener('gattserverdisconnected', (event) => {
                        //connectButton.textContent = '连接蓝牙设备';
                        this.OnstatusChange(this,false);
                        this.connected=false;
                    });
                    return this.device.gatt.connect();
                })
                .then(server => {
                    this.log('Getting Service...');
                    return server.getPrimaryService(this.filters);
                })
                .then(service => {
                    this.Service = service;
                    this.log('Getting Characteristic...');
                    //return service.requestMtu(250);
                    return service.getCharacteristic(this.readservice);
                })
                .then(characteristic => {
                    //myCharacteristic = characteristic;
                    return characteristic.startNotifications().then(_ => {
                        this.log('> Notifications started');
                        this.log("Connected to: " + this.deviceName);
                        characteristic.addEventListener('characteristicvaluechanged',
                            (event) => {
                                this.buffer.push(...new Uint8Array(event.target.value.buffer));
                                if(this.buffer.length>=this.rxReqCount)
                                {
                                    this.OnReceiveData(this.buffer);
                                    if(this.rxPromise){
                                        if(this.buffer.length>=this.rxReqCount){
                                            const buff=this.buffer.splice(0,this.rxReqCount);
                                            this.rxPromiseresolve(this.rxPromisecallback(buff));
                                            this.rxPromise=null;
                                        }
                                    }
                                }
                                else
                                    this.OnReceiveData(this.buffer);
                            });
                    });
                })
                .then(_ => {
                    return this.Service.getCharacteristic(this.writeservice);
                })
                .then(sender => {
                    this.log('> get Sender');
                    this.Sender = sender;
                    this.OnstatusChange(this,true);
                    this.connected=true;
                    //connectButton.textContent = '断开蓝牙设备';
                })
                .catch(error => {
                    this.log('蓝牙连接错误:' + error);
                });
            }
            catch(error){
                this.log('蓝牙连接错误:' + error);
            }
        }
        close(){
            try{
                this.connected=false;
                this.OnstatusChange(this,false);
                this.device.gatt.disconnect();
            }catch(error){
                this.log(`error:${error.toString()}`);
            }
        }
        sendBytes(v){
            if(!this.Sender)return;
            if(this.rxFollowTx)this.rxReqCount=v.length;
            return this.Sender.writeValue(new Uint8Array(v));
        }
        waitBytes(call=()=>{},nbytes=-1){
            if(nbytes>0)this.rxReqCount=nbytes;
            if(this.rxPromise)this.rxPromisereject();
            this.rxPromise = new Promise((resolve, reject) => {
                this.rxPromiseresolve=resolve;
                this.rxPromisereject=reject;
            });
            this.rxPromisecallback=call;
            return this.rxPromise;
        }
    }

    class COMHelper{
        constructor(statschange,onrecvdata){
            if(!('serial' in navigator))return;
            this.OnstatusChange=statschange?statschange:()=>{};
            this.OnReceiveData=onrecvdata?onrecvdata:()=>{};
            
            this.Sender=null;
            this.deviceName='';
            this.device=null;
            this.connected=false;
            this.isOpen=false;
            this.buffer=[];
            this.logs=[];
            this.COMInfo='';
            this.COMReader=null;
            this.COMWriter=null;
//--------------------------------------------
//            this.rxEnable=OnRecvString!=null;
//            this.bytesEnable=OnRecvData!=null;
//            this.OnRecvString=OnRecvString?OnRecvString:()=>{};
//            this.OnDataReceive=null;
//            this.COM=null;
//            this.buffer=[];
//            this.rxCache=[];
//            this.IdleTime=0;
//-------------------------------------------
            this.rxFollowTx=true;
            this.rxReqCount=1;
            this.rxPromise=null;
            this.rxPromiseresolve=null;
            this.rxPromisereject=null;
            this.rxPromisecallback=null;
            this.timer=setInterval(() => {
                if(this.buffer.length>=this.rxReqCount)
                {
                    //this.OnReceiveData(this.buffer);
                    if(this.rxPromise){
                        if(this.buffer.length>=this.rxReqCount){
                            const buff=this.buffer.splice(0,this.rxReqCount);
                            this.rxPromiseresolve(this.rxPromisecallback(buff));
                            this.rxPromise=null;
                        }
                    }
                }
            }, 1);
        }
        log(obj){
            this.logs.push(obj.toString());
        }
        async portSelect(){
            await navigator.serial
            .requestPort()
            .then((port) => {
                this.COM=port;
                this.COMInfo=JSON.stringify(port.getInfo());
            })
            .catch((e) => {
                this.COM=null;
                console.log(e);
                // The user didn't select a port.
            });
        }
        async open(baudRate=115200,partiy='none',databits=8,stopbits=1){
            if(this.isOpen){
                try {
                    this.COMReader.releaseLock();
                    this.COMWriter.releaseLock();
                    await this.COM.close();
                    //await COMReader.cancel();
                } catch (e) {
                    console.log(e);
                    return false;
                    //TODO handle the exception
                }
                this.buffer=[];
                this.isOpen=false;
                this.OnstatusChange(this,this.isOpen);
                return false;
            }
            else{
                await this.portSelect();
                if(this.COM==null){
                    console.log("打开串口失败");
                    return false;
                }
            }
            //配置串口信息
            let cfg={
                baudRate: baudRate,
                parity: partiy,
                dataBits: databits,
                stopBits:stopbits,
            }
            console.log(cfg);
            try{
                await this.COM.open(cfg);
            }catch(e){
                console.log("打开串口失败");
                this.OnstatusChange(this,this.isOpen);
                return false;
            }
            this.COMReader = this.COM.readable.getReader();
            this.COMWriter = this.COM.writable.getWriter();
            
            if(this.COMReader!=null){
                this.isOpen=true;
                this.OnstatusChange(this,this.isOpen);
            }

            try {
                while (this.isOpen) {
                    const { value, done } = await this.COMReader.read();
                    if (done) {
                        this.COMReader.releaseLock();
                        break;
                    }
                    
                    if (value) {
                        this.buffer.push(...new Uint8Array(value.buffer));
                        if(this.buffer.length>=this.rxReqCount)
                        {
                            this.OnReceiveData(this.buffer);
                            if(this.rxPromise){
                                const buff=this.buffer.splice(0,this.rxReqCount);
                                this.rxPromiseresolve(this.rxPromisecallback(buff));
                                this.rxPromise=null;
                            }
                        }
                        else
                            this.OnReceiveData(this.buffer);
                    }
                }
            } catch (e) {
                console.log(e);
                // Handle |error|...
            } finally {
                this.COMReader.releaseLock();
                this.COMWriter.releaseLock();
                this.isOpen=false;
                this.OnstatusChange(this,this.isOpen);
                if(this.rxPromise){
                    this.rxPromisereject();
                    this.rxPromise=null;
                }
            }
            return this.isOpen;
        }
        close(){
            try{
                this.isOpen=false;
                this.OnstatusChange(this,this.isOpen);
                this.COMReader.releaseLock();
                this.COMWriter.releaseLock();
                this.COM.close();
            }catch(error){
                log(`error:${error.toString()}`);
            }
        }
        sendBytes(v){
            if(!this.isOpen)return;
            if(this.rxFollowTx)this.rxReqCount=v.length;
            return Promise.resolve().then(e=>this.COMWriter.write(Uint8Array.from(v)));
        }
        waitBytes(call=()=>{},nbytes=-1){
            if(nbytes>0)this.rxReqCount=nbytes;
            if(this.rxPromise)this.rxPromisereject();
            this.rxPromise = new Promise((resolve, reject) => {
                this.rxPromiseresolve=resolve;
                this.rxPromisereject=reject;
            });
            this.rxPromisecallback=call;
            return this.rxPromise;
        }
    }

    // ===== WebUART：第三种串口（网络转发，配合 C# SerialForwarder 使用）=====
    // 服务端用 WebSocket 把目标机 COM 桥接到网络；本类在浏览器侧实现与
    // BLEUART / COMHelper 完全一致的接口（open/close/sendBytes/waitBytes/onReceive），
    // 因此可直接作为 DebugAdapter 的第三种 Transport。
    // 关键点：波特率在服务端配置，浏览器侧 open() 不再需要波特率参数，只传 URL。
    class WebUART{
        constructor(url, statschange=null, onrecvdata=()=>{}){
            if(typeof WebSocket==='undefined')return;
            this.url=url;
            this.deviceName=url;
            this.OnstatusChange=statschange?statschange:()=>{};
            this.OnReceiveData=onrecvdata?onrecvdata:()=>{};
            
            this.ws=null;
            this.connected=false;
            this.buffer=[];
            this.logs=[];

            this.rxFollowTx=true;
            this.rxReqCount=1;
            this.rxPromise=null;
            this.rxPromiseresolve=null;
            this.rxPromisereject=null;
            this.rxPromisecallback=null;
            this.timer=setInterval(() => {
                if(this.buffer.length>=this.rxReqCount)
                {
                    if(this.rxPromise){
                        if(this.buffer.length>=this.rxReqCount){
                            const buff=this.buffer.splice(0,this.rxReqCount);
                            this.rxPromiseresolve(this.rxPromisecallback(buff));
                            this.rxPromise=null;
                        }
                    }
                }
            }, 1);
        }
        log(obj){
            this.logs.push(obj.toString());
        }
        open(){
            if(this.connected){
                this.close();
                this.connected=false;
                this.OnstatusChange(this,false);
                return;
            }
            try{
                this.ws=new WebSocket(this.url);
                this.ws.binaryType='arraybuffer';
                this.ws.onopen=()=>{
                    this.connected=true;
                    this.OnstatusChange(this,true);
                };
                this.ws.onclose=()=>{
                    this.connected=false;
                    this.OnstatusChange(this,false);
                };
                this.ws.onerror=(e)=>{
                    this.log('WebSocket错误:'+(e.message||e.type));
                };
                this.ws.onmessage=(event)=>{
                    this.buffer.push(...new Uint8Array(event.data));
                    if(this.buffer.length>=this.rxReqCount)
                    {
                        this.OnReceiveData(this.buffer);
                        if(this.rxPromise){
                            const buff=this.buffer.splice(0,this.rxReqCount);
                            this.rxPromiseresolve(this.rxPromisecallback(buff));
                            this.rxPromise=null;
                        }
                    }
                    else
                        this.OnReceiveData(this.buffer);
                };
            }
            catch(error){
                this.log('WebSocket连接错误:'+error);
            }
        }
        close(){
            try{
                this.connected=false;
                this.OnstatusChange(this,false);
                if(this.ws)this.ws.close();
            }catch(error){
                this.log(`error:${error.toString()}`);
            }
        }
        sendBytes(v){
            if(!this.connected||!this.ws) return Promise.resolve();
            if(this.rxFollowTx)this.rxReqCount=v.length;
            this.ws.send(new Uint8Array(v));
            return Promise.resolve();
        }
        waitBytes(call=()=>{},nbytes=-1){
            if(nbytes>0)this.rxReqCount=nbytes;
            if(this.rxPromise)this.rxPromisereject();
            this.rxPromise = new Promise((resolve, reject) => {
                this.rxPromiseresolve=resolve;
                this.rxPromisereject=reject;
            });
            this.rxPromisecallback=call;
            return this.rxPromise;
        }
    }

    class UARTSWDDevice{
        constructor(COM){
            this.COM=COM;
            this.data=[];
            this.Parity=0;
            this.rate=0xfc;

            this.lastInt=0;
            this.lastData=[];

            this.rcache=[];
            this.wcache=[];
            this.coreID=0;
            this.transRate=0;
            this.packetsize=4;
            for (let i = 0; i < 46; i++) {
                this.rcache.push(255);
                this.wcache.push(255);
            }
            this.brInt=(r)=>{
                for (let i = 0; i < 8; i++) {
                    if (r & 1) this.rcache[i]=0xff;
                    else this.rcache[i]=0xf0;
                    r >>= 1;
                }
                return this.rcache;
            }
            this.rInt=(r)=>{
                return this.COM.sendBytes(this.brInt(r));
            }
            this.bwInt=(r,v)=>{
                for (let i = 0; i < 8; i++) {
                    if (r & 1) this.wcache[i]=0xff;
                    else this.wcache[i]=0xf0;
                    r >>= 1;
                }
                let addr = 0;
                for (let i = 13; i < 45; i++) {
                    if (v & 1) this.wcache[i]=0xff;
                    else this.wcache[i]=0xf0;
                    addr += v;
                    v >>>= 1;
                }
                this.wcache[45] = (addr&1) ? 0xff : 0xf0;
                return this.wcache;
            }
            this.wInt=(r,v)=>{
                return this.COM.sendBytes(this.bwInt(r,v));
            }
        }
        w8(v, data) {
            data = data ? data : this.data;
            for (let i = 0; i < 8; i++) {
                if (v & 1) data.push(255);
                else data.push(240);
                v >>= 1;
            }
        }
        w32(v, data) {
            data = data ? data : this.data;
            let addr = 0;
            for (let i = 0; i < 32; i++) {
                if (v & 1) data.push(255);
                else data.push(240);
                addr += v;
                v >>>= 1;
            }
            return addr;
        }

        rst(){
            this.COM.buffer.length=0;
            this.data.length=0;
            this.w32(0xffffffff);
            this.w32(0xffffffff);
            this.w8(0x9e);
            this.w8(0xe7);
            this.w32(0xffffffff);
            this.w32(0xffffffff);
            this.data.push(...[0xf0, 0xf0]);
            this.w8(0xa5);
            this.data.push(...[255, 255, 255]);
            this.w32(0xffffffff);
            this.data.push(...[255, 255, 255]);
            return this.COM.sendBytes(this.data)
            .then(e=>this.COM.waitBytes((b)=>(this.lastInt=this.readInt(this.lastData=b))));
        }

        wBus(addr,value){
            return this.wInt(addr,value)
            .then(e=>this.COM.waitBytes((b)=>(this.lastInt=this.readInt(this.lastData=b))));
        }

        rBus(addr){
            return this.rInt(addr)
            .then(e=>this.COM.waitBytes((b)=>(this.lastInt=this.readInt(this.lastData=b))));
        }

        WriteData(addr,data){
            this.data.length=0;
            this.data.push(...this.bwInt(0x8b,addr));
            this.data.push(...this.bwInt(0xbb,data));
            this.data.push(...this.brInt(0x8d));
            return this.COM.sendBytes(this.data)
            .then(e=>this.COM.waitBytes((b)=>null));
        }

        ReadData(addr){
            this.data.length=0;
            this.data.push(...this.bwInt(0x8b,addr));
            this.data.push(...this.brInt(0x8d));
            this.data.push(...this.brInt(0x9f));
            this.data.push(...this.brInt(0x8d));
            this.data.push(...this.brInt(0x9f));
            return this.COM.sendBytes(this.data)
            .then(e=>this.COM.waitBytes((b)=>(this.lastInt=this.readInt(this.lastData=b))));
        }

        Go(){
            return this.WriteData(0xE000EDF0,0xA05F0001);
        }

        Halt(){
            return this.WriteData(0xE000EDF0,0xA05F0003);
        }

        isHalt(){
            return this.ReadData(0xE000EDF0)
            .then(e=>((e&0x00020000)!=0));
        }

        WriteReg(reg,value){
            return this.WriteData(0xE000EDF8,value)
            .then(e=>this.WriteData(0xE000EDF4,reg|0x10000))
        }

        Reset(){
            return this.wBus(0x81,0x1e);
        }

        ReadReg(reg){
            return this.WriteData(0xE000EDF4,reg)
            .then(e=>this.ReadData(0xE000EDF8))
        }

        connect(){
            return this.rst()
            .then(e=>{
                this.coreID=e;
                this.rate = ([this.lastData[190],this.lastData[189]].sort()[1])|0xf0;
                //this.rate = this.rate > 192? 192 : this.rate;
                console.log(`CoreID: ${Hex32(e)} Rate: ${this.rate}`);
                
                return this.wBus(0x81,0x1e)})
            .then(e=>this.wBus(0xb1,0))
            .then(e=>this.wBus(0xA9,0x50000000))
            .then(e=>this.rBus(0x8D))
            .then(e=>this.rBus(0x8D))
            .then(e=>this.rBus(0x8D))
            .then(e=>this.wBus(0xb1,0))
            .then(e=>this.wBus(0xa3,0x23000012))
            .then(e=>this.rBus(0x8D))
            .then(e=>this.Go())
        }

        softReset(){
            this.COM.buffer.length=0;
            return this.Halt()
            .then(e=>this.WriteData(0xE000EDFC,1))
            .then(e=>this.ReadData(0xE000EDF0))
            .then(e=>this.WriteData(0xE000ED0C,0x05fa0004))
            .then(e=>this.WriteReg(16,0x01000000))
            .then(e=>this.WriteData(0xE000EDFC,(1 << 24)))
        }

        // MEM-AP 带 packed AddrInc 的自动地址自增只在 1KB(0x400)页内有效,
        // 跨页会回绕到页首(例: 写 0x200003FC 后下个字会回到 0x20000000)。
        // 故按 1KB 页切分, 每页单独设 TAR(0x8B), 确保跨页数据落到正确地址。
        writeMem32(addr,data){
            const PAGE=0x400, MSK=PAGE-1;
            let pos=0, cur=addr;
            const total=data.length;
            let chain=Promise.resolve();
            while(pos<total){
                const maxInPage=PAGE-(cur&MSK);              // 本页剩余可写字节
                const take=Math.min(maxInPage, total-pos);
                if(take<=0) break;
                const segAddr=cur;                           // const 迭代绑定, 避免异步回调捕获最终 cur
                const seg=data.slice(pos,pos+take);          // 单页片段(4 字节对齐)
                chain=chain.then(()=>this._writeMem32Page(segAddr,seg));
                pos+=take; cur+=take;
            }
            return chain;
        }

        _writeMem32Page(addr,data){
            let r=new DataHelper(data);
            let len=(data.length+3)>>>2;
            return this.wBus(0x8B,addr)
            .then(e=>{
                if(this.packetsize>0){
                    let write=()=>{
                        if(r.rpos<r.data.length){
                            this.data.length=0;
                            this.data.push(...this.bwInt(0xBB,r.r32()));
                            if(r.rpos<r.data.length&&this.packetsize>1)this.data.push(...this.bwInt(0xBB,r.r32()));
                            if(r.rpos<r.data.length&&this.packetsize>2)this.data.push(...this.bwInt(0xBB,r.r32()));
                            if(r.rpos<r.data.length&&this.packetsize>3)this.data.push(...this.bwInt(0xBB,r.r32()));
                            if(r.rpos<r.data.length&&this.packetsize>4)this.data.push(...this.bwInt(0xBB,r.r32()));
                            if(r.rpos<r.data.length&&this.packetsize>5)this.data.push(...this.bwInt(0xBB,r.r32()));
                            if(r.rpos<r.data.length&&this.packetsize>6)this.data.push(...this.bwInt(0xBB,r.r32()));
                            //console.log(`rpos:${r.rpos} : size:${this.data.length}`);
                            this.transRate=r.rpos/r.data.length;
                            return this.COM.sendBytes(this.data).then(_=>write());
                        }
                        return null;
                    }
                    return write();
                }
                else{
                    this.data.length=0;
                    for (let i = 0; i < len; i++)
                        this.data.push(...this.bwInt(0xBB,r.r32()));
                    return this.COM.sendBytes(this.data);
                }
            })
            .then(e=>this.COM.waitBytes(()=>{},len*46))
            .then(e=>this.rBus(0x8D))
            .then(e=>{this.COM.buffer.length=0;});
        }

        // 设置 CSW 控制/状态字: size 0=8bit,1=16bit,2=32bit, 均带 packed 地址自增
        // 对应 C 版 SWD.SetDataLenght / WriteCSW (0x23000010 | size, 0x10=AddrInc(packed))
        setDataLength(size){
            return this.wBus(0xa3, (0x23000010 | (size & 3)));
        }

        // 忠实复刻 C 版 SWD.WriteMem + SetDataLenght:
        // 设 CSW size 后, 每个 SWD DRW 写仍是 32bit; MEM-AP 按当前地址低位只提取对应 lane
        // (屏蔽其余字节), 故把每个 16/8bit 元素 << 到它在该 32bit 字里的字节位置(打包进 u32),
        // 逐元素写一笔 DRW, 由 packed AddrInc 自增地址。addr 可非字对齐(对齐偏移打包,
        // 与固件 rd(p+(addr&3),len) 同款处理)。批量发送同 writeMem32 已验证可靠。
        // 受 1KB 自增回绕限制, 按页切分, 每页单独设 TAR。
        _writeMemBySize(size, addr, data){
            const count = 1 << size;                 // 每元素字节数 1/2/4
            const len = data.length;
            if(len % count !== 0) return Promise.reject(new Error(`writeMem: data length ${len} not multiple of ${count}`));
            const PAGE=0x400, MSK=PAGE-1;
            const numElems = len / count;             // 总元素数
            return this.setDataLength(size).then(()=>{
                let chain = Promise.resolve();
                let js = 0;                            // 起始元素下标
                while(js < numElems){
                    const segAddr = addr + js*count;   // 本页片段起始地址(TAR)
                    const pageBase = segAddr & ~MSK;
                    const maxAddr  = pageBase + PAGE;   // 页尾(不含)
                    // 本页内可写到的最后一个元素下标(地址 < 页尾)
                    let je = Math.floor((maxAddr - 1 - addr) / count);
                    if(je > numElems - 1) je = numElems - 1;
                    const segData = data.slice(js*count, (je+1)*count);
                    chain = chain.then(()=> this._writeMemBySizePage(size, segAddr, segData));
                    js = je + 1;
                }
                return chain;
            }).then(()=> this.setDataLength(2));        // 复原 32bit
        }

        // 单个 1KB 页内的 16/8bit 写: 把 segData 按 lane 移位打包成 u32, 设 TAR=segAddr, 批量发 DRW
        _writeMemBySizePage(size, addr, data){
            const count = 1 << size;
            const numWrites = data.length / count;     // 本页元素数
            const off0 = addr & 3;
            const buf = new Uint8Array(off0 + data.length);
            for(let k=0;k<data.length;k++) buf[off0 + k] = data[k] & 0xff;
            const words = [];
            for(let i=0;i<buf.length;i+=4){
                let u=0;
                for(let k=0;k<4;k++) u |= (buf[i+k]||0) << (k*8);
                words.push(u);
            }
            return this.wBus(0x8B, addr)               // TAR = addr
            .then(()=>{
                this.data.length = 0;
                for(let j=0;j<numWrites;j++){
                    const bytePos = off0 + j*count;
                    const wi = Math.floor(bytePos / 4);
                    this.data.push(...this.bwInt(0xBB, words[wi]));  // W_DRW, AP 提取对应 lane
                }
                return this.COM.sendBytes(this.data)
                    .then(()=> this.COM.waitBytes(()=>{}, numWrites*46));
            })
            .then(()=> this.rBus(0x8D))
            .then(()=> { this.COM.buffer.length=0; });
        }

        // 16bit 写入: data 为字节数组(长度应为偶数), 每 2 字节为一个 16bit 值(小端)。
        // 走真实 16bit CSW 路径(设 size=1 + 按 lane 移位打包), 与 C 版 WriteMem(16bit) 一致。
        writeMem16(addr,data){
            return this._writeMemBySize(1, addr, data);
        }

        // 8bit 写入: data 为字节数组。走真实 8bit CSW 路径(设 size=0 + 按 lane 移位打包)。
        writeMem8(addr,data){
            return this._writeMemBySize(0, addr, data);
        }

        // 同样受 1KB 自增回绕限制, 按页切分, 每页单独设 TAR; 读完拼接成完整结果。
        readMem32(addr,length){
            const PAGE=0x400, MSK=PAGE-1;
            let pos=0, cur=addr;
            const total=length;
            const out=[];
            let chain=Promise.resolve();
            while(pos<total){
                const maxInPage=PAGE-(cur&MSK);              // 本页剩余可读字节
                const take=Math.min(maxInPage, total-pos);
                if(take<=0) break;
                const segAddr=cur;                           // const 迭代绑定, 避免异步回调捕获最终 cur
                chain=chain.then(()=> this._readMem32Page(segAddr, take))
                           .then(arr=>{ out.push(...arr); });
                pos+=take; cur+=take;
            }
            return chain.then(()=> out);
        }

        _readMem32Page(addr,length){
            this.COM.buffer.length=0;
            let len=(length+3)>>>2;
            return this.wBus(0x8B,addr)
            .then(e=>this.rBus(0x8d))
            .then(e=>this.rBus(0x9f))
            .then(e=>{
                this.COM.buffer.length=0;
                let bytes=this.brInt(0x9F);
                if(this.packetsize>0){
                    let count=0;
                    let read=()=>{
                        if(count<len){
                            this.data.length=0;
                            this.data.push(...bytes);count++;
                            if(count<len&&this.packetsize>1){this.data.push(...bytes);count++;}
                            if(count<len&&this.packetsize>2){this.data.push(...bytes);count++;}
                            if(count<len&&this.packetsize>3){this.data.push(...bytes);count++;}
                            if(count<len&&this.packetsize>4){this.data.push(...bytes);count++;}
                            if(count<len&&this.packetsize>5){this.data.push(...bytes);count++;}
                            if(count<len&&this.packetsize>6){this.data.push(...bytes);count++;}
                            this.transRate=count/len;
                            //console.log(`rpos:${count} : ${len}`);
                            return this.COM.sendBytes(this.data).then(_=>read());
                        }
                        return null;
                    }
                    return read();
                }
                else{
                    this.data.length=0;
                    for (let i = 0; i < len; i++)
                        this.data.push(...bytes);
                    return this.COM.sendBytes(this.data);
                }
            })
            .then(e=>{
                return this.COM.waitBytes((b)=>{let v=this.readInts(b,len);this.COM.buffer.length=0;return v;},len*46);
            })
        }


        async AllReg(){
            let regs=[];
            for (let i = 0; i < 21; i++) {
                let val= await this.ReadReg(i);
                regs.push(val);
            }
            return regs;
        }

        async viewregs(){
            let str=[];
            for (let i = 0; i < 17; i++) {
                let v=await this.ReadReg(i);
                if(i<13){
                    let r=`R`+i;
                    if(i<10)r+=' '
                    str.push(`${r} = 0x${Hex32(v)}\r\n`);
                }
                else{
                    switch(i){
                        case 13:str.push(`SP  = 0x${Hex32(v)}\r\n`);break;
                        case 14:str.push(`LR  = 0x${Hex32(v)}\r\n`);break;
                        case 15:str.push(`PC  = 0x${Hex32(v)}\r\n`);break;
                        case 16:str.push(`xPSR= 0x${Hex32(v)}\r\n`);break;
                    }
                }
            }
            return str.join('');
        }

        readInt(data) {
            if (data.length < 35) return;
            let index = data.length - 35;
            let value = 0;
            const r=this.rate;
            for (let i = 0; i < 32; i++) {
                value >>>= 1;
                if (data[index + i] > r) value |= 0x80000000;
            }
            return value;
        }

        readInts(data,len){
            if(data.length<46*len)return;
            let index=data.length-35;
            let vals=[];
            for (let j = 0; j < len; j++) {
                let value=0;
                for(let i=0;i<32;i++){
                    value>>>=1;
                    if(data[index+i]>this.rate)value|=0x80000000;
                }
                index-=46;
                vals.unshift(value);
            }
            return vals;
        }

    }

    class STLINK{
        constructor(){
            this.OnstatusChange=()=>{};
            this.CMD=()=>{};
            this.stlink=null;
            this.VCC=0;
            this.CoreID=0;
            this.REG=[];
            this.Version=null;
            this.SPEED={
                SWC_4MHZ : 0,
                SWC_1P8MHZ_DIVISOR : 1,
                SWC_1P2MHZ_DIVISOR : 2,
                SWC_950KHZ_DIVISOR : 3,
                SWC_480KHZ_DIVISOR : 7,
                SWC_240KHZ_DIVISOR : 15,
                SWC_125KHZ_DIVISOR : 31,
                SWC_100KHZ_DIVISOR : 40,
                SWC_50KHZ_DIVISOR : 79,
                SWC_25KHZ_DIVISOR : 158,
                SWC_15KHZ_DIVISOR : 265,
                SWC_5KHZ_DIVISOR : 798,
            };
            this.connected=false;
            this.coreID=-1;
        }
        open(){
            if(this.connected){
                this.connected=false;
                this.OnstatusChange(this,this.connected);
                this.stlink.close();
                return;
            }
            return navigator.usb
            .requestDevice({ filters: [{ vendorId: 0x0483 }] })
            .then((device) => {
                this.stlink=device;
                console.log(device.productName); // "Arduino Micro"
                console.log(device.manufacturerName); // "Arduino LLC"
                //device.addEventListener('disconnect', () => {
                //    this.connected=false;
                //    this.OnstatusChange(this,this.connected);
                //});
                return device.open();
            })
            .then(()=>{
                return this.stlink.claimInterface(0);
            })
            .then(()=>{
                this.connected=true;
                this.OnstatusChange(this,this.connected);
                this.CMD=function(len,Cmds){
                    let u8=new Uint8Array(Cmds);
                    return this.stlink.transferOut(0x02,u8).then(()=>{
                        if(len>0)
                            return this.stlink.transferIn(1,len);
                        else
                            return null;
                    })
                    .then(e=>{
                        if(e!=null)
                            return e.data;//return new Uint8Array(e.data.buffer);
                    })
                }
            })
            .catch((error) => {
                console.error(error);
            });
        }

        async getMode(){
            let r=await this.CMD(2,[0xf5]);
            this.mode=r.getUint8();
            return this.mode;
        }

        async exitDFU(){
            if(await this.getMode()==0)
                await this.CMD(0,[0xf3,0x07]);
            return true;
        }

        async SWDMode(){
            await this.CMD(2,[0xf2,0x30,0xa3]);
            return true;
        }

        async SWDSpeed(speed){
            await this.CMD(2,new DataHelper([0xf2,0x43]).w16(speed).bytes());
            return true;
        }

        async getCoreID(){
            let r=await this.CMD(4,[0xf2,0x22])
            return (this.coreID=r.getUint32(0,true));
        }
        
        async getVoltage(){
            let r=await this.CMD(8,[0xf7])
            return (2400*r.getUint32(4,true)/r.getUint32(0,true))|0;
        }

        async Reset(){
            await this.CMD(2,[0xf2,0x32])
            return true;
        }

        async HardWareReset(){
            await this.CMD(2,[0xf2,0x3c,2])
            return true;
        }


        async WriteData(addr,data){
            let r=await this.CMD(2,new DataHelper([0xf2,0x35]).w32(addr).w32(data).bytes());
            if(r.getUint8(0,true)!=0x80)this.Reset();
            return r!=null;
        }
        async ReadData(addr){
            let r=await this.CMD(8,new DataHelper([0xf2,0x36]).w32(addr).w32(0).bytes());
            //let r=await this.stlink.transferIn(1,8);
            if(r.getUint8(0,true)!=0x80)this.Reset();
            return r.getUint32(4,true);
        }

        async Go(){
            return await this.WriteData(0xE000EDF0,0xA05F0001);
        }

        async Halt(){
            return await this.WriteData(0xE000EDF0,0xA05F0003);
        }

        async isHalt(){
            let r=await this.ReadData(0xE000EDF0);
            return (r&0x00020000)!=0;
        }

        async writeMem32(addr,data){
            //let len=(((data.length+3)/4)|0)<<2;
            //while(data.length<len)data.push(0xff);
            await this.WriteData(addr,0);
            await this.CMD(0,new DataHelper([0xf2,0x08]).w32(addr).w16(data.length).bytes());
            let r=await this.stlink.transferOut(0x02,new Uint8Array(data));
            await this.delayms(10);
            //await this.ReadStats();
            return r!=null;
        }

        // 以下两个按 C 固件 STLinkV2.c 的 WRITEMEM_16BIT(0x48)/WRITEMEM_8BIT(0x0d) 实现
        // 由固件内部 SetDataLenght 切换 CSW 位宽,数据以字节数组(data)传入,len=字节数
        async writeMem16(addr,data){
            await this.CMD(0,new DataHelper([0xf2,0x48]).w32(addr).w16(data.length).bytes());
            let r=await this.stlink.transferOut(0x02,new Uint8Array(data));
            await this.delayms(10);
            return r!=null;
        }

        async writeMem8(addr,data){
            await this.CMD(0,new DataHelper([0xf2,0x0d]).w32(addr).w16(data.length).bytes());
            let r=await this.stlink.transferOut(0x02,new Uint8Array(data));
            await this.delayms(10);
            return r!=null;
        }

        async readMem32(addr,len){
            await this.ReadData(addr);
            await this.CMD(0,new DataHelper([0xf2,0x07]).w32(addr).w16(len).bytes());
            await this.delayms(20);
            let r=await this.stlink.transferIn(1,len);
            //await this.ReadStats();
            //r=await this.stlink.transferIn(1,len);
            return new Uint32Array(r.data.buffer);
        }

        async ReadStats(){
            let regs=await this.CMD(12,[0xf2,0x3e]);
            return new Uint32Array(regs.buffer);
        }

        async ReadRegs(){
            let regs=await this.CMD(88,[0xf2,0x3a]);
            return new Uint32Array(regs.buffer);
        }

        async ReadReg(index){
            let r=await this.CMD(8,[0xf2,0x33,index&0x1f,0,0,0,0,0]);
            return r.getUint32(4,true);
        }

        async WriteReg(index,data){
            let r=await this.CMD(2,new DataHelper([0xf2,0x34,index&0x1f]).w32(data).bytes());
            await this.ReadStats();
            return r!=null;
        }

        delayms(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        async softReset(){
            await this.Halt();
            await this.WriteData(0xE000EDFC,1);
            //let r=await this.ReadData(0xE000EDF0);
            await this.WriteData(0xE000ED0C,0x05fa0004);
            await this.delayms(10);
            await this.WriteReg(16,0x01000000);
            await this.WriteData(0xE000EDFC, (1 << 24));
            return true;
        }

        async getVersion(){
            this.Version = await this.CMD(6,[0xf1,0x80]);
            return this.Version;
        }
        async connect(){
            //await this.Init();
            //await this.getMode();
            //await new Promise(resolve => setTimeout(resolve, 2));
            //await this.Reset();
            //await this.Reset();
            await this.getVersion();
            if(2!=await this.getMode()){
                await this.exitDFU();
                if(2!=await this.getMode())
                    await this.SWDMode();
                await this.getMode();
            }
            await this.SWDSpeed(this.SPEED.SWC_4MHZ);
            this.VCC=await this.getVoltage();
            console.log(`${(this.VCC/1000).toFixed(2)}V`);
            this.CoreID=await this.getCoreID();
            console.log(`0x${toHex32(this.CoreID)}`);
            //let h=await this.ReadData(0xE000EDF0);
            //console.log(`0x${toHex32(h)}`);
            //let regs=await this.ReadRegs();
            //if((regs[0]&0xff)==0x80){
            //    for (let i = 0; i < regs.length-1; i++) {
            //        this.REG[i]=regs[i+1];
            //    }
            //}
            
            return this.CoreID;
        }
    }

    function toHex(v) {
        let hex;
        if ((v & 0xf) < 10) hex = String.fromCharCode(48 + (v & 0xf));
        else hex = String.fromCharCode(65 + (v & 0xf) - 10);
        v >>>= 4;
        if ((v & 0xf) < 10) hex = String.fromCharCode(48 + (v & 0xf)) + hex;
        else hex = String.fromCharCode(65 + (v & 0xf) - 10) + hex;
        return hex;
    }
    function toHex32(v) {
        return toHex((v >>> 24) & 0xff) + toHex((v >>> 16) & 0xff) + toHex((v >>> 8) & 0xff) + toHex(v & 0xff);
    }
    function padHex(value) {
        return ('00' + value.toString(16).toUpperCase()).slice(-2);
    }
    function Hex8(value) {
        return ('0' + (value&0xff).toString(16).toUpperCase()).slice(-2);
    }
    function Hex16(value) {
        return ('000' + (value&0xffff).toString(16).toUpperCase()).slice(-4);
    }
    function Hex32(value) {
        return Hex16((value>>>16))+Hex16(value);
    }

    function u32t8(uint32){
        uint32 = Array.isArray(uint32)?new Uint32Array(uint32):uint32;
        let u8Array = new Uint8Array(uint32.length * 4);
        for (let i = 0; i < uint32.length; i++) {
            u8Array[i * 4] = uint32[i] & 0xFF;
            u8Array[i * 4 + 1] = (uint32[i] >> 8) & 0xFF;
            u8Array[i * 4 + 2] = (uint32[i] >> 16) & 0xFF;
            u8Array[i * 4 + 3] = (uint32[i] >> 24) & 0xFF;
        }
        return u8Array;
    }

    function viewhex(array,hex=true){
        let str=[];
        str.push('HEX   |')
        for (let i = 0; i < 16; i++) {
            str.push(hex && `${toHex(i&0xff)} ` || `${i.toString().padStart(2, '0')} `);
        }
        let newline=true;
        let lineindex=0;
        for (let i = 0; i < array.length; i++) {
            
            if(i%16==0){
                newline=true;
            }
            if(newline){
                newline=false;
                let it=hex && (toHex((i>>>8)&0xff)+toHex(i&0xff)) || (''+i);
                while(it.length<5)it+=' ';
                str.push(`\r\n${it} |`);
            }
            str.push(`${toHex(array[i]&0xff)} `);
        }
        return str.join('');
    }

    

    function Elfparse(elfarray){
        if (Array.isArray(elfarray)) {
            elfarray = new Uint8Array(elfarray);
        }
        let elfHeaderView = new DataView(elfarray.buffer);
        let elfMagic = elfHeaderView.getUint32(0, true); // ELF magic number
        if (elfMagic !== 0x464c457f) {
            console.error('Not a valid ELF file');
            return;
        }
        let elfHeader = {
            'e_ident': elfarray.slice(0, 16),
            'e_type': elfHeaderView.getUint16(16, true),
            'e_machine': elfHeaderView.getUint16(18, true),
            'e_version': elfHeaderView.getUint32(20, true),
            'e_entry': elfHeaderView.getUint32(24, true),
            'e_phoff': elfHeaderView.getUint32(28, true),
            'e_shoff': elfHeaderView.getUint32(32, true),
            'e_flags': elfHeaderView.getUint32(36, true),
            'e_ehsize': elfHeaderView.getUint16(40, true),
            'e_phentsize': elfHeaderView.getUint16(42, true),
            'e_phnum': elfHeaderView.getUint16(44, true),
            'e_shentsize': elfHeaderView.getUint16(46, true),
            'e_shnum': elfHeaderView.getUint16(48, true),
            'e_shstrndx': elfHeaderView.getUint16(50, true)
        };
        let elfProgramHeaders = [];
        for (let i = 0; i < elfHeader.e_phnum; i++) {
            let offset = elfHeader.e_phoff + i * elfHeader.e_phentsize;
            let programHeader = {
                'p_type': elfHeaderView.getUint32(offset, true),
                'p_offset': elfHeaderView.getUint32(offset + 4, true),
                'p_vaddr': elfHeaderView.getUint32(offset + 8, true),
                'p_paddr': elfHeaderView.getUint32(offset + 12, true),
                'p_filesz': elfHeaderView.getUint32(offset + 16, true),
                'p_memsz': elfHeaderView.getUint32(offset + 20, true),
                'p_flags': elfHeaderView.getUint32(offset + 24, true),
                'p_align': elfHeaderView.getUint32(offset + 28, true)
            };
            elfProgramHeaders.push(programHeader);
        }
        let info={};
        let rom = [];
        for (let i = 0; i < elfProgramHeaders.length; i++) {
            if (elfProgramHeaders[i].p_type === 1 && (elfProgramHeaders[i].p_flags & 0x4) !== 0) {
                rom.push(elfarray.slice(elfProgramHeaders[i].p_offset, elfProgramHeaders[i].p_offset + elfProgramHeaders[i].p_filesz));
            }
        }
        let elfSectionHeaders = [];
        for (let i = 0; i < elfHeader.e_shnum; i++) {
            let offset = elfHeader.e_shoff + i * elfHeader.e_shentsize;
            let sectionHeader = {
                'sh_name': elfHeaderView.getUint32(offset, true),
                'sh_type': elfHeaderView.getUint32(offset + 4, true),
                'sh_flags': elfHeaderView.getUint32(offset + 8, true),
                'sh_addr': elfHeaderView.getUint32(offset + 12, true),
                'sh_offset': elfHeaderView.getUint32(offset + 16, true),
                'sh_size': elfHeaderView.getUint32(offset + 20, true),
                'sh_link': elfHeaderView.getUint32(offset + 24, true),
                'sh_info': elfHeaderView.getUint32(offset + 28, true),
                'sh_addralign': elfHeaderView.getUint32(offset + 32, true),
                'sh_entsize': elfHeaderView.getUint32(offset + 36, true)
            };
            elfSectionHeaders.push(sectionHeader);
        }
        

        let elfSectionMap={};
        let elfSectionNames = [];
        let shstrtab = elfarray.slice(elfSectionHeaders[elfHeader.e_shstrndx].sh_offset, elfSectionHeaders[elfHeader.e_shstrndx].sh_offset + elfSectionHeaders[elfHeader.e_shstrndx].sh_size);
        for (let i = 0; i < elfHeader.e_shnum; i++) {
            let offset = elfSectionHeaders[i].sh_name;
            let name = '';
            for (let j = offset; shstrtab[j] !== 0; j++) {
                name += String.fromCharCode(shstrtab[j]);
            }
            elfSectionNames.push(name);
            elfSectionMap[name]=elfSectionHeaders[i];
        }
        let elfSymbolsSection = null;
        let elfStringSection = null;
        let elfStringMap = {};
        let symtabindex=-1;
        for (let i = 0; i < elfHeader.e_shnum; i++) {
            if (elfSectionNames[i] === '.symtab') {
                symtabindex=i;
                elfSymbolsSection = elfarray.slice(elfSectionHeaders[i].sh_offset, elfSectionHeaders[i].sh_offset + elfSectionHeaders[i].sh_size);
            }
            if (elfSectionNames[i] === '.strtab') {
                let strtabSection = elfStringSection = elfarray.slice(elfSectionHeaders[i].sh_offset, elfSectionHeaders[i].sh_offset + elfSectionHeaders[i].sh_size);
                for (let j = 0; j < strtabSection.length; j++) {
                    let name = '';
                    let startindex=j;
                    while (strtabSection[j] !== 0) {
                        name += String.fromCharCode(strtabSection[j]);
                        j++;
                    }
                    elfStringMap[startindex]=name;
                }
            }
        }
        let elfSymbols = [];
        let symbolNames = {};
        if (elfSymbolsSection) {
            let symbolSize = 16; // Assuming 32-bit ELF
            let numSymbols = elfSymbolsSection.length / symbolSize;
            for (let i = 0; i < numSymbols; i++) {
                let offset = elfSectionHeaders[symtabindex].sh_offset + i * symbolSize;
                let symbol = {
                    'st_name':  elfHeaderView.getUint32(offset, true),
                    'st_value': elfHeaderView.getUint32(offset + 4, true),
                    'st_size':  elfHeaderView.getUint32(offset + 8, true),
                    'st_info':  elfHeaderView.getUint8(offset + 12),
                    'st_other': elfHeaderView.getUint8(offset + 13),
                    'st_shndx': elfHeaderView.getUint16(offset + 14, true)
                };
                elfSymbols.push(symbol);
            }
            
            for (let symbol of elfSymbols) {
                let name = elfStringMap[symbol.st_name];
                if (name) {
                    symbolNames[name] = symbol;
                }
            }
            console.log(symbolNames);
            info.symbol=symbolNames;
        }
        if(elfSectionMap["DevDscr"]){
            let dt=elfSectionMap["DevDscr"];
            let constDataSection = dt.sh_offset;
            let constDataSize = dt.sh_size;
            let flashDevice = {
                Vers: elfHeaderView.getUint16(constDataSection, true),
                DevName: '',
                DevType: elfHeaderView.getUint16(constDataSection + 2+128, true),
                DevAdr: elfHeaderView.getUint32(constDataSection + 4+128, true),
                szDev: elfHeaderView.getUint32(constDataSection + 8+128, true),
                szPage: elfHeaderView.getUint32(constDataSection + 12+128, true),
                Res: elfHeaderView.getUint32(constDataSection + 16+128, true),
                valEmpty: elfHeaderView.getUint8(constDataSection + 20+128, true),
                toProg: elfHeaderView.getUint32(constDataSection + 24+128, true),
                toErase: elfHeaderView.getUint32(constDataSection + 28+128, true),
                sectors: []
            };

            for (let i = 0; i < 128; i++) {
                flashDevice.DevName += String.fromCharCode(elfarray[constDataSection+i+2]);
            }
            for (let i = 0; i < 512; i += 8) {
                let sector = {
                    szSector: elfHeaderView.getUint32(constDataSection + 32 + 128 + i, true),
                    AddrSector: elfHeaderView.getUint32(constDataSection + 32 + 128 + i + 4, true)
                };
                if(sector.szSector===0xffffffff)break;
                flashDevice.sectors.push(sector);
            }
            //let BLOB_HEADER = [0x00,0xBE,0x0A,0xE0,0x0D,0x78,0x2D,0x06,0x68,0x40,0x08,0x24,0x40,0x00,0x00,0xD3,0x58,0x40,0x64,0x1E,0xFA,0xD1,0x49,0x1C,0x52,0x1E,0x00,0x2A,0xF2,0xD1,0x70,0x47];
            let BLOB_HEADER = [0x00,0xBE,0x0A,0xE0];
            let HEADER_SIZE = BLOB_HEADER.length;
            let Stack_Size = 128;
            let entry = 0x20000000;
            flashDevice['Init']         =entry+HEADER_SIZE+symbolNames['Init'       ].st_value;
            flashDevice['UnInit']       =entry+HEADER_SIZE+symbolNames['UnInit'     ].st_value;
            flashDevice['EraseChip']    =entry+HEADER_SIZE+symbolNames['EraseChip'  ].st_value;
            flashDevice['EraseSector']  =entry+HEADER_SIZE+symbolNames['EraseSector'].st_value;
            flashDevice['ProgramPage']  =entry+HEADER_SIZE+symbolNames['ProgramPage'].st_value;
            let blobHeaderArray = new Uint8Array(BLOB_HEADER);
            let romWithBlobHeader = new Uint8Array(rom[0].length + blobHeaderArray.length);
            romWithBlobHeader.set(blobHeaderArray, 0);
            romWithBlobHeader.set(rom[0], blobHeaderArray.length);
            rom[0] = romWithBlobHeader;
            flashDevice['ROM']=rom[0];
            flashDevice['RAM']=entry;
            flashDevice['BUFF']=(entry+rom[0].length+1023)&~1023;
            flashDevice['BKPT']=entry+1;
            flashDevice['RSB']=entry+HEADER_SIZE+elfSectionMap["PrgData"].sh_addr;
            flashDevice['RSP']=entry+rom[0].length+flashDevice.szPage+Stack_Size;
            //console.log(flashDevice);
            return flashDevice;
        }
        info.ROM=rom.length>0?rom[0]:null;
        return info;
    }

    function hex2bin(hexfile) {
        let binArray = [];
        let lines = hexfile.split('\n');
        for (let line of lines) {
            if (line.startsWith(':')) {
                let byteCount = parseInt(line.substring(1, 3), 16);
                let address = parseInt(line.substring(3, 7), 16);
                let recordType = parseInt(line.substring(7, 9), 16);
                if (recordType !== 0) continue; // Skip if record type is not data
                let data = line.substring(9, 9 + byteCount * 2);
                let checksum = parseInt(line.substring(9 + byteCount * 2), 16);
                let sum = (byteCount + (address >> 8) + (address & 0xFF) + parseInt(recordType, 16));
                checksum=((~checksum&0xff)+1)&0xff;
                for (let i = 0; i < data.length; i += 2) {
                    let byte = parseInt(data.substring(i, i + 2), 16);
                    binArray.push(byte);
                    sum += byte;
                }
                if ((sum & 0xFF) !== checksum) {
                    console.error('Checksum error on line: ' + line);
                }
            }
        }
        return binArray;
    }

    async function downloadbin_device(bin=null,device=null) {
        if(!bin)return;
        if(!device)return;
        await SWD.connect()
        .then(e=>SWD.connect())
        .then(e=>SWD.softReset())
        .then(e=>SWD.Halt())
        .then(e=>SWD.isHalt())
        .then(e=>console.log(`halt:${e}`));
        let index=0;
        let count=device.ROM.length;
        do{
            let ct=count>=1024?1024:count;
            let chunk = device.ROM.slice(index, index + ct);
            await SWD.writeMem32(device.RAM + index, chunk);
            count-=ct;
            index+=ct;
        }while(count);
        
        
        index=0;
        count=bin.length;
        console.log(`count:${count}`);
        let exec=async (func,r0=0,r1=0,r2=0,r3=0,databuff=device.RSB,sp=device.BUFF-4,bkpt=device.BKPT)=>{
            await SWD.WriteReg(0,r0)
            .then(e=>SWD.ReadReg(0,r0))
            .then(e=>SWD.WriteReg(0,r0))
            .then(e=>SWD.WriteReg(1,r1))
            .then(e=>SWD.WriteReg(2,r2))
            .then(e=>SWD.WriteReg(3,r3))
            .then(e=>SWD.WriteReg(9,databuff))
            .then(e=>SWD.WriteReg(13,sp))
            .then(e=>SWD.WriteReg(14,bkpt))
            .then(e=>SWD.WriteReg(15,func))
            .then(e=>SWD.WriteReg(16,0x01000000))
            .then(e=>SWD.Go());
            for (let i = 0; i < 6400000; i++)if(await SWD.isHalt()){console.log(i);return true};
            console.log('time out');
            return false;
        }
        //int Init(unsigned long adr, unsigned long clk, unsigned long fnc);
        if(!await exec(device.Init,device.DevAdr,0,1))return;console.log('Init');
        //await SWD.ReadData(0x40022014).then(e=>console.log(Hex32(e)))
        if(!await exec(device.EraseChip))return;console.log('EraseChip');
        await SWD.ReadData(device.RAM).then(e=>{
            console.log(Hex32(e));
            if(e==(0xffffffff|0))
                return SWD.connect().then(e=>SWD.Halt()).then(e=>console.log('reconnect'));
        })
        //if(!await exec(device.Init))return;console.log('Init');
        //await SWD.delayms(100);
        //console.log(viewhex(u32t8(await SWD.readMem32(0x20000000,1024))));
        let pagesize=device.szPage;
        let binsize=count;
        while(count){
            
            let chunkSize = count>=pagesize?pagesize:count;
            let chunk = bin.slice(0, chunkSize);
            bin = bin.slice(chunkSize);
            count -= chunkSize;
            console.log(`count:${count} chunk:${chunk.length} index:${index} rate:${index/binsize}`);
            //await SWD.writeMem32(device.BUFF,chunk).then(e=>exec(device.ProgramPage,device.DevAdr+index,chunkSize,device.BUFF))
            await SWD.writeMem32(device.BUFF,chunk);
            //console.log(viewhex(u32t8(await SWD.readMem32(device.BUFF,chunkSize))));
            if(!await exec(device.ProgramPage,index+device.DevAdr,chunkSize,device.BUFF))return;
            index+=chunkSize;
            setUploadRate(index/binsize);
        }
        setUploadRate(-1);
        await SWD.connect()
        .then(e=>SWD.connect())
        .then(e=>SWD.softReset())
        .then(e=>SWD.Go());
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function downloadspibin(bin, downloadinfo, skiperase = false) {
        if (!bin) return;
        const ADDR_STAS = downloadinfo.symbol.stats.st_value;
        const ADDR_XOR = downloadinfo.symbol.xorvalue.st_value;
        const ADDR_SUM = downloadinfo.symbol.sumdata.st_value;
        const ADDR_ADDR = downloadinfo.symbol.addr.st_value;
        const ADDR_DATA = downloadinfo.symbol.databuff.st_value;

        console.log(`STAS: 0x${Hex32(ADDR_STAS)}`);
        console.log(`XOR: 0x${Hex32(ADDR_XOR)}`);
        console.log(`SUM: 0x${Hex32(ADDR_SUM)}`);
        console.log(`ADDR: 0x${Hex32(ADDR_ADDR)}`);
        console.log(`DATA: 0x${Hex32(ADDR_DATA)}`);

        await SWD.connect()
        .then(e => SWD.connect())
        .then(e => SWD.softReset())
        .then(e => SWD.WriteReg(15, 0x20000000))
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.writeMem32(0x20000000, downloadinfo.ROM))
        .then(e => SWD.WriteData(0xE000ED08, 0x20000000))
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.Go())
        .then(e => SWD.WriteData(ADDR_ADDR, 0xffffffff))
        .then(e => SWD.WriteData(ADDR_STAS, skiperase ? 0 : 3))
        .then(e => delay(10))
        .then(e => SWD.Halt())
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.Go());

        if (!skiperase)
        for (let i = 0; i < 1000000; i++) {
            let sta = await SWD.ReadData(ADDR_STAS);
            console.log(`i:${i} sta:${sta}`);
            if (sta & 0x80) break;
            if (i == 99) return;
            await delay(100);
        }
        let count = bin.length;
        let binsize = bin.length;
        let index = 0;
        let first = 2;
        console.log(`count:${count}`);
        setUploadRate(0);
        let timer = setInterval(() => {
            setUploadRate((index + (SWD.transRate * 256)) / binsize);
        }, 100);
        while (count) {
            let chunkSize = count >= 256 ? 256 : count;
            let chunk = bin.slice(0, chunkSize);
            bin = bin.slice(chunkSize);
            count -= chunkSize;
            let sum = 0;
            if (chunk.length < 256) {
                if (!Array.isArray(chunk)) {
                    let carr = [];
                    carr.push(...chunk);
                    chunk = carr;
                }
                while (chunk.length < 256) chunk.push(0xFF);
            }
            for (let i = 0; i < chunk.length; i++) {
                sum += chunk[i];
            }
            do {
                console.log(`count:${count} chunk:${chunk.length} index:${index}`);
                await SWD.writeMem32(ADDR_DATA, chunk)
                .then(e => SWD.WriteData(ADDR_SUM, sum))
                .then(e => SWD.WriteData(ADDR_ADDR, index))
                .then(e => SWD.WriteData(ADDR_STAS, 2));
                for (let i = 0; i < 127; i++) {
                    let sta = await SWD.ReadData(ADDR_STAS);
                    if (sta & 0x80) break;
                    if (i == 126) {
                        clearInterval(timer);
                        return;
                    }
                }
                if (first) first--;
            } while (first);
            SWD.transRate = 0;
            index += chunkSize;
        }
        clearInterval(timer);
        setUploadRate(-1);
        await SWD.connect()
        .then(e => SWD.connect())
        .then(e => SWD.softReset())
        .then(e => delay(50))
        .then(e => SWD.Go())
        .then(e => delay(50))
        .then(e => SWD.Halt())
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.Go());
    }

    async function uploadspibin(addr = 0, size, downloadinfo) {
        const ADDR_STAS = downloadinfo.symbol.stats.st_value;
        const ADDR_XOR = downloadinfo.symbol.xorvalue.st_value;
        const ADDR_SUM = downloadinfo.symbol.sumdata.st_value;
        const ADDR_ADDR = downloadinfo.symbol.addr.st_value;
        const ADDR_DATA = downloadinfo.symbol.databuff.st_value;

        console.log(`STAS: 0x${Hex32(ADDR_STAS)}`);
        console.log(`XOR: 0x${Hex32(ADDR_XOR)}`);
        console.log(`SUM: 0x${Hex32(ADDR_SUM)}`);
        console.log(`ADDR: 0x${Hex32(ADDR_ADDR)}`);
        console.log(`DATA: 0x${Hex32(ADDR_DATA)}`);

        await SWD.connect()
        .then(e => SWD.connect())
        .then(e => SWD.softReset())
        .then(e => SWD.WriteReg(15, 0x20000000))
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.writeMem32(0x20000000, downloadinfo.ROM))
        .then(e => SWD.WriteData(0xE000ED08, 0x20000000))
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.Go())
        .then(e => delay(10))
        .then(e => SWD.Halt())
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.Go());

        let count = size;
        let binsize = size;
        let index = addr;
        console.log(`count:${count}`);
        setUploadRate(0);
        let timer = setInterval(() => {
            setUploadRate((index + (SWD.transRate * 256)) / binsize);
        }, 100);
        let data = [];
        while (count) {
            let chunkSize = count >= 256 ? 256 : count;
            count -= chunkSize;
            chunkSize = 256;
            console.log(`count:${count} chunk:${chunkSize} index:${index}`);
            await SWD.WriteData(ADDR_ADDR, index)
            .then(e => SWD.WriteData(ADDR_STAS, 1));
            for (let i = 0; i < 127; i++) {
                let sta = await SWD.ReadData(ADDR_STAS);
                if (sta & 0x80) break;
                if (i == 127) {
                    clearInterval(timer);
                    return;
                }
            }
            data.push(...await SWD.readMem32(ADDR_DATA, chunkSize));
            SWD.transRate = 0;
            index += chunkSize;
        }
        clearInterval(timer);
        setUploadRate(-1);
        await SWD.connect()
        .then(e => SWD.connect())
        .then(e => SWD.softReset())
        .then(e => delay(50))
        .then(e => SWD.Go())
        .then(e => delay(50))
        .then(e => SWD.Halt())
        .then(e => SWD.ReadReg(15)).then(e => console.log(Hex32(e)))
        .then(e => SWD.Go());
        return u32t8(data).slice(0, size);
    }


    function download_uint8(data,name='rom.bin'){
        if(!data)return;
        if(Array.isArray(data)){
            data=new Uint8Array(data);
        }
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function SAVE_ROM(count,addr=0x8000000){
        let index=0;
        let vals=new Uint8Array(count);
        do{
            let ct=count>=1024?1024:count;
            let mem=await SWD.readMem32(addr + index,ct).then(e=>u32t8(e));
            vals.set(mem, index);
            count-=ct;
            index+=ct;
        }while(count);
        
        download_uint8(vals,'ROM.bin');
    }

    var mcuchain=null;
    var mcuchainlast=null;
    var swdconnect=false;
    var swdopen=false;
    
    function mcuR32(addr, call) {
        if(!swdopen)return;
        if (!swdconnect) mcuConnect();
        if (!mcuchainlast) {
            // 初始化队列
            mcuchain = mcuchainlast = Promise.resolve()
                .then(() => SWD.ReadData(addr))
                .then(call)
                .catch(console.error) // 捕获异常
                .finally(() => { mcuchain = mcuchainlast = null; }); // 确保清理
        } else {
            mcuchainlast = mcuchainlast
                .then(() => SWD.ReadData(addr))
                .then(call)
                .catch(console.error); // 链式捕获异常
        }
    }
    function mcuW32(addr,value){
        if(!swdopen)return;
        if (!swdconnect) mcuConnect();
        if (!mcuchainlast) {
            // 初始化队列
            mcuchain = mcuchainlast = Promise.resolve()
                .then(()=>SWD.WriteData(addr,value))
                .catch(console.error) // 捕获异常
                .finally(() => { mcuchain = mcuchainlast = null; }); // 确保清理
        } else {
            mcuchainlast = mcuchainlast
                .then(()=>SWD.WriteData(addr,value))
                .catch(console.error); // 链式捕获异常
        }
        return `0x${Hex32(addr)}=${value}`;
    }
    function mcuConnect(){
        if(!swdopen)return;
        if (swdconnect)return;
        swdconnect=true;
        if (!mcuchainlast) {
            // 初始化队列
            mcuchain = mcuchainlast = Promise.resolve()
                .then(()=>SWD.connect())
                .catch(console.error) // 捕获异常
                .finally(() => { mcuchain = mcuchainlast = null; }); // 确保清理
        } else {
            mcuchainlast = mcuchainlast
                .then(()=>SWD.connect())
                .catch(console.error); // 链式捕获异常
        }
    }
    var exec=async (func,r0=0,r1=0,r2=0,r3=0,databuff=download_flm.RSB,sp=download_flm.BUFF-4,bkpt=download_flm.BKPT)=>{
            await SWD.WriteReg(0,r0)
            .then(e=>SWD.ReadReg(0,r0))
            .then(e=>SWD.WriteReg(0,r0))
            .then(e=>SWD.WriteReg(1,r1))
            .then(e=>SWD.WriteReg(2,r2))
            .then(e=>SWD.WriteReg(3,r3))
            .then(e=>SWD.WriteReg(9,databuff))
            .then(e=>SWD.WriteReg(13,sp))
            .then(e=>SWD.WriteReg(14,bkpt))
            .then(e=>SWD.WriteReg(15,func))
            .then(e=>SWD.WriteReg(16,0x01000000))
            .then(e=>SWD.Go());
            for (let i = 0; i < 64; i++)if(await SWD.isHalt()){console.log(i);return true};
            return false;
        }
    var runram = async (ROM) => {
        const data = lastdownloadinfo.ROM;  // 假设为 Uint8Array 或 ArrayBuffer
        const chunkSize = 1024;             // 每次写入 1KB
        const baseAddr = 0x20000000;
        if(! await SWD.isHalt()){
            await SWD.Halt();
        }
        // 分块写入
        for (let offset = 0; offset < data.length; offset += chunkSize) {
            const chunk = data.slice(offset, offset + chunkSize);
            if((chunk.length&3)>0){
                chunk.push(0xff);
                chunk.push(0xff);
            }
            await SWD.writeMem32(baseAddr + offset, chunk);
            // 可以加个小延时避免 SWD 过载（视情况）
            // await delay(1);
        }

        // 设置 SP 和 PC（原逻辑保持不变）
        const v = new DataHelper(lastdownloadinfo.ROM);
        let sp=v.r32();
        let pc=v.r32()|1;
        console.log(`halt: ${await SWD.isHalt()}`);
        await SWD.WriteReg(13, sp);  // SP
        sp = await SWD.ReadReg(13);
        console.log(`SP: ${Hex32(sp)}`);
        console.log(`halt: ${await SWD.isHalt()}`);
        await SWD.WriteReg(15, pc); // PC，设置 Thumb 位
        pc = await SWD.ReadReg(15);
        console.log(`PC: ${Hex32(pc)}`);
        await SWD.Go();
    };
