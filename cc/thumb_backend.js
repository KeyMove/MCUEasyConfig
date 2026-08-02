'use strict';
(function(){'use strict';
const _c4ThumbIsNode = (typeof module !== 'undefined' && module.exports);
// 浏览器下从全局取 (由 c4_reg.js 注入 window.C4Reg)；Node 下用 require
let C4RegMod;
if (_c4ThumbIsNode) {
  C4RegMod = require('./c4_reg.js');
} else if (typeof window !== 'undefined' && window.C4Reg) {
  C4RegMod = window.C4Reg;
}
const {RegBackend, opcode, tokens} = C4RegMod;
/**
 * ThumbSC — ARM Thumb 指令集 汇编器 + 反汇编器 + CPU 虚拟机
 * ============================================================
 * 单文件集成三大功能:
 *   - ThumbM0:   汇编(asm→byte) / 反汇编(byte→asm)
 *   - ThumbCPU:  CPU 执行虚拟机
 *
 * Usage:
 *   const { ThumbM0, ThumbCPU } = require('./thumbsc.js');
 *
 *   // --- 汇编 ---
 *   const asm = new ThumbM0();
 *   const bytes = asm.parseASM('MOV R0, #42\nMOV R1, #10\nADD R2, R0, R1');
 *
 *   // --- 执行 ---
 *   const cpu = new ThumbCPU();
 *   cpu.loadProgram(new Uint8Array(bytes), 0);
 *   cpu.run(3);
 *   console.log(cpu.dumpRegs());
 *
 *   // --- 反汇编 ---
 *   const disasm = asm.parseThumb(bytes, true);
 *   console.log(disasm);
 */

// ============================================================
// 常量
// ============================================================
const REG = Object.freeze({
    R0:0,R1:1,R2:2,R3:3,R4:4,R5:5,R6:6,R7:7,
    R8:8,R9:9,R10:10,R11:11,R12:12,
    SP:13, LR:14, PC:15, CPSR:16
});

const I0=1,I1=2,I7=128,I8=256,I9=512,I10=1024,I11=2048,I12=4096;
const L1=1,L2=3,L3=7,L4=15,L5=31,L7=127,L8=255,L10=1023,L11=2047;
const FT=32,FQ=1<<27,FV=1<<28,FC=1<<29,FZ=1<<30,FN=1<<31;

// ============================================================
// 内存
// ============================================================
class ThumbMemory {
    constructor(size=0x10000) {
        this.buffer=new Uint8Array(size);
        this.size=size;
        this.extMap=new Map(); // for addresses >= size (e.g. 0x40000000, 0x50000000)
        this._onWrite=null; // callback(addr,val,size) for debug logging
        this._winBase=0; this._winSize=0; // window: addresses in [base, base+len) map to buffer[0..len)
    }
    mapWindow(base,len){ this._winBase=base>>>0; this._winSize=len>>>0; }
    _bufIdx(a){
        if(a<this.size) return a;
        if(a>=this._winBase&&a<this._winBase+this._winSize) return a-this._winBase;
        return -1;
    }
    loadProgram(data,addr=0){
        for(let i=0;i<data.length;i++){
            const bi=this._bufIdx(addr+i);
            if(bi>=0) this.buffer[bi]=data[i];
            else this.extMap.set(addr+i,data[i]);
        }
    }
    readByte(a){ a>>>=0; const bi=this._bufIdx(a); return bi>=0?this.buffer[bi]:(this.extMap.get(a)??0)&0xFF; }
    readShort(a){ a>>>=0; const bi=this._bufIdx(a);
        if(bi>=0) return (this.buffer[bi]|(this.buffer[bi+1]<<8))&0xFFFF;
        const lo=(this.extMap.get(a)??0)&0xFF, hi=(this.extMap.get(a+1)??0)&0xFF;
        return (lo|(hi<<8))&0xFFFF;
    }
    readInt(a){ a>>>=0; const bi=this._bufIdx(a);
        if(bi>=0) return (this.buffer[bi]|(this.buffer[bi+1]<<8)|(this.buffer[bi+2]<<16)|(this.buffer[bi+3]<<24));
        const b0=(this.extMap.get(a)??0)&0xFF, b1=(this.extMap.get(a+1)??0)&0xFF, b2=(this.extMap.get(a+2)??0)&0xFF, b3=(this.extMap.get(a+3)??0)&0xFF;
        return (b0|(b1<<8)|(b2<<16)|(b3<<24));
    }
    writeByte(a,v){ a>>>=0; v&=0xFF; const bi=this._bufIdx(a);
        if(bi>=0) this.buffer[bi]=v; else this.extMap.set(a,v);
        if(this._onWrite) this._onWrite(a,v,1);
    }
    writeShort(a,v){ a>>>=0; v&=0xFFFF; const bi=this._bufIdx(a);
        if(bi>=0){ this.buffer[bi]=v&0xFF; this.buffer[bi+1]=(v>>8)&0xFF; }
        else{ this.extMap.set(a,v&0xFF); this.extMap.set(a+1,(v>>8)&0xFF); }
        if(this._onWrite) this._onWrite(a,v,2);
    }
    writeInt(a,v){ a>>>=0; const bi=this._bufIdx(a);
        if(bi>=0){ this.buffer[bi]=v&0xFF; this.buffer[bi+1]=(v>>8)&0xFF; this.buffer[bi+2]=(v>>16)&0xFF; this.buffer[bi+3]=(v>>24)&0xFF; }
        else{ this.extMap.set(a,v&0xFF); this.extMap.set(a+1,(v>>8)&0xFF); this.extMap.set(a+2,(v>>16)&0xFF); this.extMap.set(a+3,(v>>24)&0xFF); }
        if(this._onWrite) this._onWrite(a,v,4);
    }
}

// ============================================================
// CPU 虚拟机
// ============================================================
class ThumbCPU {
    constructor(memSize=0x10000){
        this.R=new Int32Array(REG.CPSR+1);
        this.R[REG.CPSR]=FT;
        this.memory=new ThumbMemory(memSize);
        this._debugMemWrites=[];
        this._showMem=false;
    }
    // 启用/禁用 MEM 写入日志 (RAM + 外设寄存器)
    set showMem(v){
        this._showMem=v;
        if(v) this.memory._onWrite=(addr,val,size)=>{
            const s=size===1?('0x'+val.toString(16).padStart(2,'0')):(size===2?('0x'+val.toString(16).padStart(4,'0')):('0x'+val.toString(16).padStart(8,'0')));
            console.log('  MEM[0x'+addr.toString(16)+'] '+(this.memory._bufIdx(addr)>=0?'[RAM]':'[EXT]')+' = '+s+' (size='+size+')');
        };
        else this.memory._onWrite=null;
    }
    get showMem(){ return this._showMem; }
    reset(){ this.R.fill(0); this.R[REG.CPSR]=FT; }
    loadProgram(data,addr=0,setPC=true){ this.memory.loadProgram(data,addr); if(setPC) this.R[REG.PC]=addr; }
    getReg(i){ return this.R[i]; }
    dumpRegs(){
        const r={};
        for(let i=0;i<=12;i++) r[`R${i}`]=this.R[i];
        r.SP=this.R[REG.SP]; r.LR=this.R[REG.LR]; r.PC=this.R[REG.PC]; r.CPSR=this.R[REG.CPSR];
        return r;
    }

    run(count){
        const R=this.R, mem=this.memory;
        let q=!!(R[REG.CPSR]&FQ), v=!!(R[REG.CPSR]&FV), c=!!(R[REG.CPSR]&FC);
        let z=!!(R[REG.CPSR]&FZ), n=!!(R[REG.CPSR]&FN);
        R[REG.PC]&=~I0;

        const Add=(a,b)=>(a>>>0)+(b>>>0);
        const Sub=(a,b)=>((a>>>0)-(b>>>0))+0x100000000;
        const SetNZ=val=>{ n=val<0; z=val===0; };
        const SetC=lval=>{ c=lval>0xFFFFFFFF; };
        const SetV_Add=(val,a,b)=>{ v=!!((a^val)&(b^val)&FN); };
        const SetV_Sub=(val,a,b)=>SetV_Add(val,a,~b+1);

        try{
            while(count-->0){
                let incr_pc=true,Rs,Rd,Rb,left,right,value,addr,lvalue,uleft,uvalue,L,B,S,H,list,Ro;
                const code=mem.readShort(R[REG.PC]);

                switch((code>>12)&L4){

                    // ---- Format 1&2: 移位/加减 ----
                    case 0:case 1:
                        Rs=(code>>3)&L3; Rd=code&L3; left=R[Rs];
                        switch((code>>11)&L2){
                            case 0: // LSL
                                right=(code>>6)&L5; uleft=left>>>0;
                                uvalue=(uleft<<right)>>>0; value=uvalue|0;
                                if(right>0) c=!!((uleft<<(right-1))&FN);
                                break;
                            case 1: // LSR
                                right=(code>>6)&L5;
                                if(right===0){ value=0; c=!!(left&FN); }
                                else{ uleft=left>>>0; uvalue=uleft>>>right; value=uvalue|0; c=!!(left&(1<<(right-1))); }
                                break;
                            case 2: // ASR
                                right=(code>>6)&L5;
                                if(right===0){ value=(left>>31)>>1; c=!!(left&FN); }
                                else{ value=left>>right; c=!!(left&(1<<(right-1))); }
                                break;
                            case 3: // ADD/SUB 3-op
                                const imm=!!((code>>10)&1), Rn=(code>>6)&L3;
                                Rs=(code>>3)&L3; Rd=code&L3; left=R[Rs]; right=imm?Rn:R[Rn];
                                if((code>>9)&1){ lvalue=Sub(left,right); value=lvalue|0; SetC(lvalue); SetV_Sub(value,left,right); }
                                else{ lvalue=Add(left,right); value=lvalue|0; SetC(lvalue); SetV_Add(value,left,right); }
                                break;
                        }
                        SetNZ(value); R[Rd]=value;
                        break;

                    // ---- Format 3: 立即数 MOV/CMP/ADD/SUB ----
                    case 2:case 3:
                        Rd=(code>>8)&L3; left=R[Rd]; right=code&L8;
                        switch((code>>11)&L2){
                            case 0: value=right; R[Rd]=value; break;
                            case 1: lvalue=Sub(left,right); value=lvalue|0; SetC(lvalue); SetV_Sub(value,left,right); break;
                            case 2: lvalue=Add(left,right); value=lvalue|0; R[Rd]=value; SetC(lvalue); SetV_Add(value,left,right); break;
                            case 3: lvalue=Sub(left,right); value=lvalue|0; R[Rd]=value; SetC(lvalue); SetV_Sub(value,left,right); break;
                        }
                        SetNZ(value);
                        break;

                    // ---- Format 4-6: ALU / Hi-Reg / PC-rel ----
                    case 4:
                        switch((code>>10)&L2){
                            case 0: // ALU
                                Rs=(code>>3)&L3; Rd=code&L3; left=R[Rd]; right=R[Rs];
                                switch((code>>6)&L4){
                                    case 0: value=left&right; R[Rd]=value; break;
                                    case 1: value=left^right; R[Rd]=value; break;
                                    case 2: // LSL reg
                                        if(right>=32){ value=0; c=right===32&&!!(left&1); }
                                        else if(right<0){ value=0; c=false; }
                                        else if(right===0) value=left;
                                        else{ uleft=left>>>0; uvalue=(uleft<<right)>>>0; value=uvalue|0; c=!!((uleft<<(right-1))&FN); }
                                        R[Rd]=value; break;
                                    case 3: // LSR reg
                                        if(right>=32){ value=0; c=right===32&&!!(left&FN); }
                                        else if(right<0){ value=0; c=false; }
                                        else if(right===0) value=left;
                                        else{ uleft=left>>>0; uvalue=uleft>>>right; value=uvalue|0; c=!!((uleft>>>(right-1))&1); }
                                        R[Rd]=value; break;
                                    case 4: // ASR reg
                                        if(right<0||right>=32){ value=left>0?0:-1; c=value<0; }
                                        else if(right===0) value=left;
                                        else{ value=left>>right; c=!!(left&(1<<(right-1))); }
                                        R[Rd]=value; break;
                                    case 5:{ // ADC
                                        const full=(left>>>0)+(right>>>0)+(c?1:0);
                                        value=full|0; R[Rd]=value; c=full>0xFFFFFFFF;
                                        v=left>0&&right>0&&value<0||left<0&&right<0&&value>0; break;
                                    }
                                    case 6:{ // SBC
                                        const full=(left>>>0)-(right>>>0)-(c?0:1);
                                        value=left-right-(c?0:1); R[Rd]=value;
                                        c=c||value<0; v=(full|0)!==value; break;
                                    }
                                    case 7: // ROR
                                        uleft=left>>>0; right&=31;
                                        value=((uleft>>>right)|(uleft<<(32-right)))|0;
                                        c=!!((uleft>>>(right-1))&I0); R[Rd]=value; break;
                                    case 8: value=left&right; break; // TST
                                    case 9: lvalue=Sub(0,right); value=lvalue|0; R[Rd]=value; SetC(lvalue); SetV_Sub(value,0,right); break;
                                    case 10: lvalue=Sub(left,right); value=lvalue|0; SetC(lvalue); SetV_Sub(value,left,right); break;
                                    case 11: lvalue=Add(left,right); value=lvalue|0; SetC(lvalue); SetV_Add(value,left,right); break;
                                    case 12: value=left|right; R[Rd]=value; break;
                                    case 13:{ // MUL
                                        const sv=BigInt(left)*BigInt(right);
                                        value=Number(sv&0xFFFFFFFFn)|0; R[Rd]=value;
                                        c=c||sv>0x7FFFFFFFn||sv<-0x80000000n; v=false; break;
                                    }
                                    case 14: value=left&~right; R[Rd]=value; break;
                                    case 15: value=~right; R[Rd]=value; break;
                                }
                                SetNZ(value); break;

                            case 1:{ // Hi-reg ops / BX
                                const H1=!!((code>>7)&1), H2=!!((code>>6)&1);
                                Rd=(code&L3)+(H1?8:0); Rs=((code>>3)&L3)+(H2?8:0);
                                switch((code>>8)&L2){
                                    case 0: left=R[Rd]; right=R[Rs]; if(Rs===REG.PC) right+=4; R[Rd]=left+right; break;
                                    case 1: left=R[Rd]; right=R[Rs]; lvalue=Sub(left,right); value=lvalue|0; SetNZ(value); SetC(lvalue); SetV_Sub(value,left,right); break;
                                    case 2: value=R[Rs]; if(Rs===REG.PC) value+=4; if(Rd===REG.PC) value-=2; R[Rd]=value; break;
                                    case 3: value=R[Rs]; if((value&I0)!==1) throw Error(`BX: invalid addr ${value.toString(16)}`); if(H1) R[REG.LR]=(R[REG.PC]+2)|I0; R[REG.PC]=value&~I0; incr_pc=false; break;
                                }
                                break;
                            }
                            case 2:case 3: // PC-rel LDR
                                Rd=(code>>8)&L3; addr=(code&L8)<<2; addr+=(R[REG.PC]+4)&~I1; R[Rd]=mem.readInt(addr);
                                break;
                        }
                        break;

                    // ---- Format 7&8: reg-offset load/store ----
                    case 5:
                        if(!(code&I9)){
                            L=!!(code&I11); B=!!(code&I10); Ro=(code>>6)&L3; Rb=(code>>3)&L3; Rd=code&L3;
                            addr=(R[Rb]>>>0)+(R[Ro]>>>0);
                            if(L){ if(B) R[Rd]=mem.readByte(addr); else R[Rd]=mem.readInt(addr); }
                            else{ if(B){ this._debugMemWrites.push({addr,val:R[Rd]&0xFF,size:1}); mem.writeByte(addr,R[Rd]); }else{ this._debugMemWrites.push({addr,val:R[Rd],size:4}); mem.writeInt(addr,R[Rd]); } }
                        }else{
                            H=!!(code&I11); S=!!(code&I10); Ro=(code>>6)&L3; Rb=(code>>3)&L3; Rd=code&L3;
                            addr=(R[Rb]>>>0)+(R[Ro]>>>0);
                            if(S){ if(H){ value=mem.readShort(addr); value=(value<<16)>>16; }else{ value=mem.readByte(addr); value=(value<<24)>>24; } R[Rd]=value; }
                            else{ if(H){ value=mem.readShort(addr); R[Rd]=value; }else{ this._debugMemWrites.push({addr,val:R[Rd]&0xFFFF,size:2}); mem.writeShort(addr,R[Rd]&0xFFFF); }}
                        }
                        break;

                    // ---- Format 9: imm-offset load/store ----
                    case 6:case 7:
                        B=!!(code&I12); L=!!(code&I11); Rb=(code>>3)&L3; Rd=code&L3;
                        value=(code>>6)&L5; if(!B) value<<=2;
                        addr=(R[Rb]>>>0)+value;
                        if(L){ if(!B) value=mem.readInt(addr); else value=mem.readByte(addr); R[Rd]=value; }
                        else{ value=R[Rd]; if(!B){ this._debugMemWrites.push({addr,val:value,size:4}); mem.writeInt(addr,value); }else{ this._debugMemWrites.push({addr,val:value&0xFF,size:1}); mem.writeByte(addr,value&0xFF); } }
                        break;

                    // ---- Format 10: halfword ----
                    case 8:
                        L=!!(code&I11); Rb=(code>>3)&L3; Rd=code&L3;
                        value=((code>>6)&L5)<<1; addr=(R[Rb]>>>0)+value;
                        if(L) R[Rd]=mem.readShort(addr); else { this._debugMemWrites.push({addr,val:R[Rd]&0xFFFF,size:2}); mem.writeShort(addr,R[Rd]&0xFFFF); }
                        break;

                    // ---- Format 11: SP-relative ----
                    case 9:
                        L=!!(code&I11); Rd=(code>>8)&L3; value=(code&L8)<<2; addr=(R[REG.SP]>>>0)+value;
                        if(L) R[Rd]=mem.readInt(addr); else { this._debugMemWrites.push({addr,val:R[Rd],size:4}); mem.writeInt(addr,R[Rd]); }
                        break;

                    // ---- Format 12: ADR ----
                    case 10:{
                        const fSP=!!(code&I11); Rd=(code>>8)&L3; value=(code&L8)<<2;
                        if(fSP) value+=R[REG.SP]; else value+=(R[REG.PC]+4)&~I1;
                        R[Rd]=value; break;
                    }

                    // ---- Format 13&14: SP/PUSH/POP/extend/rev ----
                    case 11:
                        switch((code>>8)&L4){
                            case 0: S=!!(code&I7); value=(code&L7)<<2; if(S) R[REG.SP]-=value; else R[REG.SP]+=value; break;
                            case 1: throw Error('CBZ not implemented');
                            case 2: // SXTH/SXTB/UXTH/UXTB
                                Rs=(code>>3)&L3; Rd=code&L3; value=R[Rs];
                                switch((code>>6)&L2){ case 0: value=(value<<16)>>16; break; case 1: value=(value<<24)>>24; break; case 2: value&=0xFFFF; break; case 3: value&=0xFF; break; }
                                R[Rd]=value; break;
                            case 3: throw Error('CBNZ not implemented');
                            case 4:case 5:{ // PUSH
                                const RF=!!(code&I8); list=code&L8; addr=R[REG.SP]>>>0;
                                if(RF){ addr-=4; this._debugMemWrites.push({addr,val:R[REG.LR],size:4}); mem.writeInt(addr,R[REG.LR]); }
                                for(let i=7;i>=0;i--) if(list&(1<<i)){ addr-=4; this._debugMemWrites.push({addr,val:R[i],size:4}); mem.writeInt(addr,R[i]); }
                                R[REG.SP]=addr|0; break;
                            }
                            case 6:case 7:case 8:throw Error('Unknown instruction');
                            case 9:throw Error('CBNZ not implemented');
                            case 10: // REV
                                Rs=(code>>3)&L3; Rd=code&L3; value=R[Rs];
                                switch((code>>6)&L2){
                                    case 0: value=((value>>>24)&0xFF)|(((value>>>16)&0xFF)<<8)|(((value>>>8)&0xFF)<<16)|((value&0xFF)<<24); break;
                                    case 1: throw Error('REV16 not implemented');
                                    case 2: throw Error('Unknown instruction');
                                    case 3: throw Error('REVSH not implemented');
                                }
                                R[Rd]=value; break;
                            case 11:throw Error('CBNZ not implemented');
                            case 12:case 13:{ // POP
                                const RF=!!(code&I8); list=code&L8; addr=R[REG.SP]>>>0;
                                for(let i=0;i<8;i++) if(list&(1<<i)){ R[i]=mem.readInt(addr); addr+=4; }
                                if(RF){ value=mem.readInt(addr); R[REG.PC]=value&~I0; addr+=4; incr_pc=false; }
                                R[REG.SP]=addr|0; break;
                            }
                            case 14:R[REG.CPSR]=(q?FQ:0)|(v?FV:0)|(c?FC:0)|(z?FZ:0)|(n?FN:0);this.interrupt(code&L8);break; // BKPT
                            case 15:break; // NOP / HINT (NOP, WFE, WFI are all no-ops in VM)
                        }
                        break;

                    // ---- Format 15: LDM/STM ----
                    case 12:
                        L=!!(code&I11); list=code&L8; Rb=(code>>8)&L3; addr=R[Rb]>>>0;
                        if(!L) for(let i=0;i<8;i++) if(list&(1<<i)){ this._debugMemWrites.push({addr,val:R[i],size:4}); mem.writeInt(addr,R[i]); addr+=4; }
                        else for(let i=0;i<8;i++) if(list&(1<<i)){ R[i]=mem.readInt(addr); addr+=4; }
                        R[Rb]=addr|0; break;

                    // ---- Format 16&17: cond branch / SWI ----
                    case 13:{
                        const soff=code&L8; let cond=false;
                        switch((code>>8)&L4){
                            case 0: cond=z; break; case 1: cond=!z; break; case 2: cond=c; break; case 3: cond=!c; break;
                            case 4: cond=n; break; case 5: cond=!n; break; case 6: cond=v; break; case 7: cond=!v; break;
                            case 8: cond=c&&!z; break; case 9: cond=!c||z; break; case 10: cond=!(n^v); break; case 11: cond=!!(n^v); break;
                            case 12: cond=!z&&!(n^v); break; case 13: cond=z||!!(n^v); break;
                            case 14: throw Error('Unknown instr(cond=1110)'); case 15: R[REG.CPSR]=(q?FQ:0)|(v?FV:0)|(c?FC:0)|(z?FZ:0)|(n?FN:0); this.interrupt(soff); break;
                        }
                        if(cond){ value=(soff&L8)<<1; if(value&I8) value|=-1^L8; R[REG.PC]+=4+value; incr_pc=false; }
                        break;
                    }

                    // ---- Format 18: B ----
                    case 14:
                        if(code&I11) throw Error('Unknown instr(B bit11=1)');
                        value=(code&L10)<<1; if(code&I10) value|=-1^L11;
                        R[REG.PC]+=4+value; incr_pc=false;
                        break;

                    // ---- Format 19: BL ----
                    case 15:
                        H=!!((code>>11)&1); value=code&L11;
                        if(!H){ R[REG.LR]=value<<12; count++; }
                        else{ addr=R[REG.LR]; addr|=value<<1; if(addr&(1<<22)){ addr<<=9; addr>>=9; } const lr=R[REG.PC]; R[REG.PC]=(lr>>>0)+(addr>>>0)+2; R[REG.LR]=lr+3; incr_pc=false; }
                        break;
                }
                if(incr_pc) R[REG.PC]+=2;
            }
        }finally{
            R[REG.CPSR]=(q?FQ:0)|(v?FV:0)|(c?FC:0)|(z?FZ:0)|(n?FN:0);
        }
    }

    // ============================================================
    // === Compiler Backend Debug Methods ===
    // ============================================================

    /** Execute 1 instruction, return { pc, code, rd, rs, op, disasm, regs, changed, memWrites } */
    step(){
        const R=this.R, mem=this.memory;
        // 清除 Thumb 模式位 (bit 0), 确保取指地址对齐到半字边界
        const pc=R[REG.PC] & ~1;
        const code=mem.readShort(pc);
        // Save register snapshot before execution
        const before=new Int32Array(R);
        this._debugMemWrites=[];
        this.run(1);
        const after=new Int32Array(R);
        // Compute changed registers
        const changed=[];
        for(let i=0;i<=16;i++) if(before[i]!==after[i]) changed.push(i);
        // Decode with ThumbM0
        const dec=(this._disasm=this._disasm||new ThumbM0());
        const asm=dec.decodeThumb(dec.InstructionsCode,code)||'DCW  ?';
        const writes=this._debugMemWrites.slice();
        this._debugMemWrites=[];
        return {
            pc:pc>>>0, code:'0x'+code.toString(16).padStart(4,'0'),
            disasm:asm.trim(), before, after, changed,
            memWrites:writes,
            regs:Object.fromEntries([...Array(16).keys(),16].map(i=>[
                i<13?'R'+i:['SP','LR','PC','CPSR'][i-13], after[i]
            ]))
        };
    }

    /** Step with detailed diff output — returns same as step() but also logs to console */
    stepDebug(){
        const info=this.step();
        const R=this.R;
        const flags={
            N:!!(R[REG.CPSR]&FN), Z:!!(R[REG.CPSR]&FZ),
            C:!!(R[REG.CPSR]&FC), V:!!(R[REG.CPSR]&FV),
            Q:!!(R[REG.CPSR]&FQ)
        };
        // Print instruction
        console.log(`[0x${info.pc.toString(16).padStart(4,'0')}] ${info.disasm}`);
        // Print register changes
        for(const ri of info.changed){
            if(ri===16) continue; // CPSR — handled separately
            const name=ri<13?'R'+ri:['SP','LR','PC','CPSR'][ri-13];
            const ov=info.before[ri], nv=info.after[ri];
            if(ov!==nv) console.log(`  ${name}: ${ov} -> ${nv}`);
        }
        // Print CPSR/flag changes
        const flagKeys=['N','Z','C','V','Q'];
        for(const f of flagKeys) {
            const oldF=!!(info.before[16]&{[f]:{'N':0x80000000,'Z':0x40000000,'C':0x20000000,'V':0x10000000,'Q':0x08000000}[f]});
            const newF=flags[f];
            if(oldF!==newF) console.log(`  ${f}: ${oldF} -> ${newF}`);
        }
        // Print memory writes
        for(const w of info.memWrites){
            console.log(`  MEM[0x${w.addr.toString(16)}]: ${w.oldVal !== undefined ? w.oldVal + ' -> ' : ''}${w.val} (size=${w.size})`);
        }
        return info;
    }

    /** Run N steps with detailed debug output */
    runDebug(count){
        let i=0;
        try {
            for(i=0;i<count;i++) this.stepDebug();
        } catch(e) {
            console.log(`--- stopped at step ${i}: ${e.message} ---`);
        }
    }

    /** Set register value */
    setReg(index,value){
        if(index>=0&&index<=16) this.R[index]=value|0;
    }

    /** Read memory bytes (size: 1|2|4), return unsigned value */
    readMem(addr,size=4){
        addr>>>=0;
        if(size===1) return this.memory.readByte(addr);
        if(size===2) return this.memory.readShort(addr);
        return this.memory.readInt(addr)>>>0;
    }

    /** Write memory */
    writeMem(addr,value,size=4){
        addr>>>=0;
        if(size===1) this.memory.writeByte(addr,value);
        else if(size===2) this.memory.writeShort(addr,value);
        else this.memory.writeInt(addr,value);
    }

    /** Get full CPU state snapshot */
    getState(){
        const R=this.R;
        const regs={};
        for(let i=0;i<=12;i++) regs['R'+i]=R[i];
        regs.SP=R[REG.SP]; regs.LR=R[REG.LR]; regs.PC=R[REG.PC];
        regs.CPSR=R[REG.CPSR];
        regs.flags={
            N:!!(R[REG.CPSR]&FN), Z:!!(R[REG.CPSR]&FZ),
            C:!!(R[REG.CPSR]&FC), V:!!(R[REG.CPSR]&FV),
            Q:!!(R[REG.CPSR]&FQ), T:!!(R[REG.CPSR]&FT)
        };
        return regs;
    }

    /** Run with per-instruction trace callback(stepInfo) */
    runWithTrace(count,callback){
        const results=[];
        while(count-->0){
            const info=this.step();
            results.push(info);
            if(callback) callback(info);
        }
        return results;
    }

    interrupt(soffset){ throw Error(`SWI ${soffset} not implemented`); }
}

// ============================================================
// ThumbM0 — 汇编器 + 反汇编器
// ============================================================
class ThumbM0{
    constructor(){
        this.baseAddr=0x08000000;
        this.AddrName={};
        this.thumbgenMap={};
        this.lastAddr=0;

        const genthumb=(name,req,action)=>{
            if(!this.thumbgenMap[name]) this.thumbgenMap[name]={};
            // 不做重复注册警告 (已有重叠的CMP:RR等)
            this.thumbgenMap[name][req]=action;
            return action;
        };
        const b2=(x,b)=>`000000000000000${(x>>>0).toString(2)}`.slice(-b);
        const Regs=r=>r<13?(r<10?`R${r} `:`R${r}`):(['SP','LR','PC'])[r-13];
        const Bcond=(b,offset)=>`B${['EQ','NE','CS','CC','MI','PL','VS','VC','HI','LS','GE','LT','GT','LE'][b]}  ${offset&0x80?(this.lastAddr=(((offset|~255)<<1)+4)):(this.lastAddr=((offset<<1)+4))}  ;@PC+BL`;
        this.Regs=Regs;

        this.InstructionsCode={
            '000mm':{
                0:['ooooosssddd',(o,Rs,Rd)=>`LSLS ${Regs(Rd)},${Regs(Rs)},#${o}`,genthumb('LSL','ORR',(o,Rs,Rd)=>`0b00000${b2(o,5)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                1:['ooooosssddd',(o,Rs,Rd)=>`LSRS ${Regs(Rd)},${Regs(Rs)},#${o}`,genthumb('LSR','ORR',(o,Rs,Rd)=>`0b00001${b2(o,5)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                2:['ooooosssddd',(o,Rs,Rd)=>`ASRS ${Regs(Rd)},${Regs(Rs)},#${o}`,genthumb('ASR','ORR',(o,Rs,Rd)=>`0b00010${b2(o,5)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                3:{
                    'mm':{
                        0:['nnnsssddd',(Rn,Rs,Rd)=>`ADDS ${Regs(Rd)},${Regs(Rs)},${Regs(Rn)}`,genthumb('ADD','RRR',(Rn,Rs,Rd)=>`0b0001100${b2(Rn,3)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        1:['nnnsssddd',(Rn,Rs,Rd)=>`SUBS ${Regs(Rd)},${Regs(Rs)},${Regs(Rn)}`,genthumb('SUB','RRR',(Rn,Rs,Rd)=>`0b0001101${b2(Rn,3)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        2:['ooosssddd',(Rn,Rs,Rd)=>`ADDS ${Regs(Rd)},${Regs(Rs)},#${Rn}`,genthumb('ADD','ORR',(o,Rs,Rd)=>`0b0001110${b2(o,3)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        3:['ooosssddd',(Rn,Rs,Rd)=>`SUBS ${Regs(Rd)},${Regs(Rs)},#${Rn}`,genthumb('SUB','ORR',(o,Rs,Rd)=>`0b0001111${b2(o,3)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                    }
                },
            },
            '001mm':{
                0:['dddoooooooo',(Rd,o)=>`MOVS ${Regs(Rd)},#${o}`,genthumb('MOV','OR',(o,Rd)=>`0b00100${b2(Rd,3)}${b2(o,8)}`|0)],
                1:['dddoooooooo',(Rd,o)=>`CMP  ${Regs(Rd)},#${o}`,genthumb('CMP','OR',(o,Rd)=>`0b00101${b2(Rd,3)}${b2(o,8)}`|0)],
                2:['dddoooooooo',(Rd,o)=>`ADDS ${Regs(Rd)},#${o}`,genthumb('ADD','OR',(o,Rd)=>`0b00110${b2(Rd,3)}${b2(o,8)}`|0)],
                3:['dddoooooooo',(Rd,o)=>`SUBS ${Regs(Rd)},#${o}`,genthumb('SUB','OR',(o,Rd)=>`0b00111${b2(Rd,3)}${b2(o,8)}`|0)],
            },
            '0100mm':{
                0:{
                    'mmmm':{
                        0: ['sssddd',(Rs,Rd)=>`ANDS ${Regs(Rd)},${Regs(Rs)}`,genthumb('AND','RR',(Rs,Rd)=>`0b010000${b2( 0,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        1: ['sssddd',(Rs,Rd)=>`EORS ${Regs(Rd)},${Regs(Rs)}`,genthumb('EOR','RR',(Rs,Rd)=>`0b010000${b2( 1,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        2: ['sssddd',(Rs,Rd)=>`LSLS ${Regs(Rd)},${Regs(Rs)}`,genthumb('LSL','RR',(Rs,Rd)=>`0b010000${b2( 2,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        3: ['sssddd',(Rs,Rd)=>`LSRS ${Regs(Rd)},${Regs(Rs)}`,genthumb('LSR','RR',(Rs,Rd)=>`0b010000${b2( 3,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        4: ['sssddd',(Rs,Rd)=>`ASRS ${Regs(Rd)},${Regs(Rs)}`,genthumb('ASR','RR',(Rs,Rd)=>`0b010000${b2( 4,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        5: ['sssddd',(Rs,Rd)=>`ADCS ${Regs(Rd)},${Regs(Rs)}`,genthumb('ADC','RR',(Rs,Rd)=>`0b010000${b2( 5,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        6: ['sssddd',(Rs,Rd)=>`SBCS ${Regs(Rd)},${Regs(Rs)}`,genthumb('SBC','RR',(Rs,Rd)=>`0b010000${b2( 6,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        7: ['sssddd',(Rs,Rd)=>`RORS ${Regs(Rd)},${Regs(Rs)}`,genthumb('ROR','RR',(Rs,Rd)=>`0b010000${b2( 7,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        8: ['sssddd',(Rs,Rd)=>`TST  ${Regs(Rd)},${Regs(Rs)}`,genthumb('TST','RR',(Rs,Rd)=>`0b010000${b2( 8,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        9: ['sssddd',(Rs,Rd)=>`NEGS ${Regs(Rd)},${Regs(Rs)}`,genthumb('NEG','RR',(Rs,Rd)=>`0b010000${b2( 9,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        // 10: CMP low-register decode (encode handled by Format 5 below);
                        //    must keep a decode entry here or 0x4288-family decodes as DCW
                        10:['sssddd',(Rs,Rd)=>`CMP  ${Regs(Rd)},${Regs(Rs)}`],
                        11:['sssddd',(Rs,Rd)=>`CMN  ${Regs(Rd)},${Regs(Rs)}`,genthumb('CMN','RR',(Rs,Rd)=>`0b010000${b2(11,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        12:['sssddd',(Rs,Rd)=>`ORRS ${Regs(Rd)},${Regs(Rs)}`,genthumb('ORR','RR',(Rs,Rd)=>`0b010000${b2(12,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        13:['sssddd',(Rs,Rd)=>`MULS ${Regs(Rd)},${Regs(Rs)}`,genthumb('MUL','RR',(Rs,Rd)=>`0b010000${b2(13,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        14:['sssddd',(Rs,Rd)=>`BICS ${Regs(Rd)},${Regs(Rs)}`,genthumb('BIC','RR',(Rs,Rd)=>`0b010000${b2(14,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        15:['sssddd',(Rs,Rd)=>`MVNS ${Regs(Rd)},${Regs(Rs)}`,genthumb('MVN','RR',(Rs,Rd)=>`0b010000${b2(15,4)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                    }
                },
                1:{
                    'mm':{
                        0: ['hssssddd',(h,Rs,Rd)=>`ADD  ${Regs(Rd+h*8)},${Regs(Rs)}`,genthumb('ADD','RR',(Rs,Rd)=>`0b01000100${b2(((Rd&0x8)!=0)|0,1)}${b2(Rs,4)}${b2(Rd,3)}`|0)],
                        1: ['hssssddd',(h,Rs,Rd)=>`CMP  ${Regs(Rd+h*8)},${Regs(Rs)}`,genthumb('CMP','RR',(Rs,Rd)=>((Rd<8&&Rs<8)?(`0b010000${b2(10,4)}${b2(Rs,3)}${b2(Rd,3)}`):(`0b01000101${b2(((Rd&0x8)!=0)|0,1)}${b2(Rs,4)}${b2(Rd,3)}`))|0)],
                        2: ['hssssddd',(h,Rs,Rd)=>`MOV  ${Regs(Rd+h*8)},${Regs(Rs)}`,genthumb('MOV','RR',(Rs,Rd)=>`0b01000110${b2(((Rd&0x8)!=0)|0,1)}${b2(Rs,4)}${b2(Rd,3)}`|0)],
                        3: {
                            'm':{
                                0:['ssssddd',(Rs,Rd)=>`BX    ${Regs(Rs)}`,genthumb('BX' ,'R',(Rs)=>`0b010001110${b2(Rs,4)}000`|0)],
                                1:['ssssddd',(Rs,Rd)=>`BLX   ${Regs(Rs)}`,genthumb('BLX','R',(Rs)=>`0b010001111${b2(Rs,4)}000`|0)],
                            }
                        },
                    }
                },
                2:['ddoooooooo',(Rd,o)=>`LDR  ${Regs(Rd)},[PC, #${this.lastAddr=o*4}]  ;@PC+ADDR`,genthumb('LDR','OPR',(o,Rb,Rd)=>`0b01001${b2(Rd,3)}${b2(o>>2,8)}`|0)],
                3:['ddoooooooo',(Rd,o)=>`LDR  ${Regs(Rd+4)},[PC, #${this.lastAddr=o*4}]  ;@PC+ADDR`],
            },
            '0101mmm':{
                6:['ooobbbddd',(Ro,Rb,Rd)=>`LDRB ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('LDRB','RRR',(Ro,Rb,Rd)=>`0b0101${b2(6,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                4:['ooobbbddd',(Ro,Rb,Rd)=>`LDR  ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('LDR' ,'RRR',(Ro,Rb,Rd)=>`0b0101${b2(4,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                2:['ooobbbddd',(Ro,Rb,Rd)=>`STRB ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('STRB','RRR',(Ro,Rb,Rd)=>`0b0101${b2(2,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                0:['ooobbbddd',(Ro,Rb,Rd)=>`STR  ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('STR' ,'RRR',(Ro,Rb,Rd)=>`0b0101${b2(0,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                7:['ooobbbddd',(Ro,Rb,Rd)=>`LDSH ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('LDSH','RRR',(Ro,Rb,Rd)=>`0b0101${b2(7,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                3:['ooobbbddd',(Ro,Rb,Rd)=>`LDSB ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('LDSB','RRR',(Ro,Rb,Rd)=>`0b0101${b2(3,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                5:['ooobbbddd',(Ro,Rb,Rd)=>`LDRH ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('LDRH','RRR',(Ro,Rb,Rd)=>`0b0101${b2(5,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                1:['ooobbbddd',(Ro,Rb,Rd)=>`STRH ${Regs(Rd)},[${Regs(Rb)},${Regs(Ro)}]`,genthumb('STRH','RRR',(Ro,Rb,Rd)=>`0b0101${b2(1,3)}${b2(Ro,3)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
            },
            '011mm':{
                3:['ooooobbbddd',(o,Rb,Rd)=>`LDRB ${Regs(Rd)},[${Regs(Rb)},#${o}]`,genthumb('LDRB','ORR',(o,Rb,Rd)=>`0b011${b2(3,2)}${b2(o,5)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                1:['ooooobbbddd',(o,Rb,Rd)=>`LDR  ${Regs(Rd)},[${Regs(Rb)},#${o*4}]`,genthumb('LDR' ,'ORR',(o,Rb,Rd)=>`0b011${b2(1,2)}${b2(o>>2,5)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                0:['ooooobbbddd',(o,Rb,Rd)=>`STR  ${Regs(Rd)},[${Regs(Rb)},#${o*4}]`,genthumb('STR' ,'ORR',(o,Rb,Rd)=>`0b011${b2(0,2)}${b2(o>>2,5)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                2:['ooooobbbddd',(o,Rb,Rd)=>`STRB ${Regs(Rd)},[${Regs(Rb)},#${o}]`,genthumb('STRB','ORR',(o,Rb,Rd)=>`0b011${b2(2,2)}${b2(o,5)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
            },
            '100mm':{
                0:['ooooobbbddd',(o,Rb,Rd)=>`STRH ${Regs(Rd)},[${Regs(Rb)},#${o*2}]`,genthumb('STRH','ORR',(o,Rb,Rd)=>`0b100${b2(0,2)}${b2(o>>1,5)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                1:['ooooobbbddd',(o,Rb,Rd)=>`LDRH ${Regs(Rd)},[${Regs(Rb)},#${o*2}]`,genthumb('LDRH','ORR',(o,Rb,Rd)=>`0b100${b2(1,2)}${b2(o>>1,5)}${b2(Rb,3)}${b2(Rd,3)}`|0)],
                2:['dddoooooooo',(Rd,o)=>`STR  ${Regs(Rd)},[SP,#${o*4}]`,genthumb('STR','OSR',(o,Rb,Rd)=>`0b100${b2(2,2)}${b2(Rd,3)}${b2(o>>2,8)}`|0)],
                3:['dddoooooooo',(Rd,o)=>`LDR  ${Regs(Rd)},[SP,#${o*4}]`,genthumb('LDR','OSR',(o,Rb,Rd)=>`0b100${b2(3,2)}${b2(Rd,3)}${b2(o>>2,8)}`|0)],
            },
            '1010m':{
                0:['dddoooooooo',(Rd,o)=>`ADD  ${Regs(Rd)},[PC,#${o*4}]`,genthumb('ADD','OPR',(o,Rb,Rd)=>`0b10100${b2(Rd,3)}${b2(o>>2,8)}`|0)],
                1:['dddoooooooo',(Rd,o)=>`ADD  ${Regs(Rd)},[SP,#${o*4}]`,genthumb('ADD','OSR',(o,Rb,Rd)=>`0b10101${b2(Rd,3)}${b2(o>>2,8)}`|0)],
            },
            '1011mmmm':{
                0:{
                    'm':{
                        0:['ooooooo',(o)=>`ADD  SP,#${o*4}`,genthumb('ADD','OS',(o,Rd)=>`0b1011${b2(0,4)}0${b2(o>>2,7)}`|0)],
                        1:['ooooooo',(o)=>`SUB  SP,#${o*4}`,genthumb('SUB','OS',(o,Rd)=>`0b1011${b2(0,4)}1${b2(o>>2,7)}`|0)],
                    }
                },
                2:{
                    'mm':{
                        0:['sssddd',(Rs,Rd)=>`SXTH ${Regs(Rd)}, ${Regs(Rs)}`,genthumb('SXTH','RR',(Rs,Rd)=>`0b1011${b2(2,4)}${b2(0,2)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        1:['sssddd',(Rs,Rd)=>`SXTB ${Regs(Rd)}, ${Regs(Rs)}`,genthumb('SXTB','RR',(Rs,Rd)=>`0b1011${b2(2,4)}${b2(1,2)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        2:['sssddd',(Rs,Rd)=>`UXTH ${Regs(Rd)}, ${Regs(Rs)}`,genthumb('UXTH','RR',(Rs,Rd)=>`0b1011${b2(2,4)}${b2(2,2)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                        3:['sssddd',(Rs,Rd)=>`UXTB ${Regs(Rd)}, ${Regs(Rs)}`,genthumb('UXTB','RR',(Rs,Rd)=>`0b1011${b2(2,4)}${b2(3,2)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                    }
                },
                4: ['rrrrrrrr',(r)=>`PUSH {${'R7,R6,R5,R4,R3,R2,R1,R0'.split(',').filter((_,i)=>r&(1<<(7-i))).join(',')}}`,genthumb('PUSH','A',(Rlist)=>`0b1011010${b2(((Rlist&0x100)!=0)|0,1)}${b2(Rlist&0xff,8)}`|0)],
                5: ['rrrrrrrr',(r)=>`PUSH {${'R7,R6,R5,R4,R3,R2,R1,R0'.split(',').filter((_,i)=>r&(1<<(7-i))).join(',')}LR}`],
                10:{
                    'mm':{
                        0:['sssddd',(Rs,Rd)=>`REV  ${Regs(Rd)}, ${Regs(Rs)}`,genthumb('REV','RR',(Rs,Rd)=>`0b1011${b2(10,4)}${b2(0,2)}${b2(Rs,3)}${b2(Rd,3)}`|0)],
                    }
                },
                12: ['rrrrrrrr',(r)=>`POP  {${'R7,R6,R5,R4,R3,R2,R1,R0'.split(',').filter((_,i)=>r&(1<<(7-i))).join(',')}}`,genthumb('POP','A',(Rlist)=>`0b1011110${b2(((Rlist&0x200)!=0)|0,1)}${b2(Rlist&0xff,8)}`|0)],
                13: ['rrrrrrrr',(r)=>`POP  {${'R7,R6,R5,R4,R3,R2,R1,R0'.split(',').filter((_,i)=>r&(1<<(7-i))).join(',')}PC}`],
                14: ['oooooooo',(o)=>`BKPT #${o}`,genthumb('BKPT','O',(o)=>`0b1011${b2(14,4)}${b2(o,8)}`|0)],
                15: ['oooooooo',(o)=>((o==0x20)?`WFE`:(o==0x30)?`WFI`:`NOP`),genthumb('WFE','',(o)=>`0b1011${b2(15,4)}${b2(0x20,8)}`|0),genthumb('WFI','',(o)=>`0b1011${b2(15,4)}${b2(0x30,8)}`|0),genthumb('NOP','',(o)=>`0b1011${b2(15,4)}${b2(0,8)}`|0)],
            },
            '1100m':{
                0:['bbboooooooo',(Rb,r)=>`STM  ${Regs(Rb)}!,{${'R7,R6,R5,R4,R3,R2,R1,R0'.split(',').filter((_,i)=>r&(1<<(7-i))).join(',')}}`,genthumb('STM','AR',(Rlist,Rb)=>`0b11000${b2(Rb,3)}${b2(Rlist&0xff,8)}`|0)],
                1:['bbboooooooo',(Rb,r)=>`LDM  ${Regs(Rb)}!,{${'R7,R6,R5,R4,R3,R2,R1,R0'.split(',').filter((_,i)=>r&(1<<(7-i))).join(',')}}`,genthumb('LDM','AR',(Rlist,Rb)=>`0b11001${b2(Rb,3)}${b2(Rlist&0xff,8)}`|0)],
            },
            '1101mmmm':{
                0: ['oooooooo',(o)=>Bcond(0,o), genthumb('BEQ','O',(o)=>`0b1101${b2( 0,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                1: ['oooooooo',(o)=>Bcond(1,o), genthumb('BNE','O',(o)=>`0b1101${b2( 1,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                2: ['oooooooo',(o)=>Bcond(2,o), genthumb('BCS','O',(o)=>`0b1101${b2( 2,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                3: ['oooooooo',(o)=>Bcond(3,o), genthumb('BCC','O',(o)=>`0b1101${b2( 3,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                4: ['oooooooo',(o)=>Bcond(4,o), genthumb('BMI','O',(o)=>`0b1101${b2( 4,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                5: ['oooooooo',(o)=>Bcond(5,o), genthumb('BPL','O',(o)=>`0b1101${b2( 5,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                6: ['oooooooo',(o)=>Bcond(6,o), genthumb('BVS','O',(o)=>`0b1101${b2( 6,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                7: ['oooooooo',(o)=>Bcond(7,o), genthumb('BVC','O',(o)=>`0b1101${b2( 7,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                8: ['oooooooo',(o)=>Bcond(8,o), genthumb('BHI','O',(o)=>`0b1101${b2( 8,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                9: ['oooooooo',(o)=>Bcond(9,o), genthumb('BLS','O',(o)=>`0b1101${b2( 9,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                10:['oooooooo',(o)=>Bcond(10,o),genthumb('BGE','O',(o)=>`0b1101${b2(10,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                11:['oooooooo',(o)=>Bcond(11,o),genthumb('BLT','O',(o)=>`0b1101${b2(11,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                12:['oooooooo',(o)=>Bcond(12,o),genthumb('BGT','O',(o)=>`0b1101${b2(12,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                13:['oooooooo',(o)=>Bcond(13,o),genthumb('BLE','O',(o)=>`0b1101${b2(13,4)}${b2(((o>>1)-2)&0xff,8)}`|0)],
                15:['oooooooo',(o)=>`SWI  ${o}`,genthumb('SWI','O',(o)=>`0b1101${b2(15,4)}${b2(o&0xff,8)}`|0)],
            },
            '1110m':{
                0:['ooooooooooo',(o)=>`B    ${o&0x400?(this.lastAddr=(((o|~0x7ff)<<1)+4)):(this.lastAddr=((o<<1)+4))}  ;@PC+BL`,genthumb('B','O',(o)=>`0b11100${b2(((o>>1)-2)&0x7ff,11)}`|0)],
            },
            '1111m':{
                0:['ooooooooooo',(o)=>`;${(this.lastAddr=o)}`],
                1:['ooooooooooo',(o)=>'BL   '+(this.lastAddr&0x0400?(this.lastAddr=((((o<<1)+(this.lastAddr<<12))|-1^(1<<23)-1)+2)):(this.lastAddr=(2+((o<<1)+(this.lastAddr<<12)))))+'  ;@PC+BL',genthumb('BL','O',(o)=>`0b11110${b2((((o>>1)-1)>>11)&0x7ff,11)}11111${b2(((o>>1)-1)&0x7ff,11)}`|0)],
            }
        }
    }

    // hex formatting
    Hex8(v){ return ('0'+(v&0xFF).toString(16).toUpperCase()).slice(-2); }
    Hex16(v){ return ('000'+(v&0xFFFF).toString(16).toUpperCase()).slice(-4); }
    Hex32(v){ return ('0000000'+(v>>>0).toString(16).toUpperCase()).slice(-8); }

    // bit extraction
    bits(val,bitformat){
        let lc='',v=0,vals=[],arg=false;
        for(let i=0;i<bitformat.length;i++){
            const c=bitformat[i]; val<<=1;
            if(c==='0'||c==='1'){ if((c==='0')===!(val&0x10000)) continue; return null; }
            if(c!==lc){ vals.push(v); lc=c; v=0; arg=true; }
            v<<=1; v|=!!(val&0x10000);
        }
        if(arg) vals.push(v);
        vals[0]=val&0xFFFF;
        return vals;
    }

    // encode single instruction
    encodeThumb(code){
        if(code.includes(':')) code=code.split(':')[1]||'';
        const cc=code.split(';')[0].trim().toUpperCase().replaceAll('[','').replaceAll(']','');
        if(!cc) return null;
        const parts=cc.split(/\s+/);
        let mnemonic=parts[0];
        const args=parts.slice(1).join('');
        const operands=args.includes('{')?args.split('!').map(o=>o.replace(',{','{')):args.split(',').map(o=>o.trim());

        // UAL 助记符归一化: Thumb-1 低寄存器数据处理指令带 S 后缀编码不变,
        // 同时兼容标准写法 (MOVS/ADDS/...) 与传统写法 (MOV/ADD/...)
        const S_ALIAS={'MOVS':'MOV','ADDS':'ADD','SUBS':'SUB','ANDS':'AND','EORS':'EOR',
            'LSLS':'LSL','LSRS':'LSR','ASRS':'ASR','ADCS':'ADC','SBCS':'SBC','RORS':'ROR',
            'NEGS':'NEG','ORRS':'ORR','MULS':'MUL','BICS':'BIC','MVNS':'MVN'};
        if(S_ALIAS[mnemonic]) parts[0]=S_ALIAS[mnemonic];
        mnemonic=parts[0];

        if(mnemonic==='DCW'){
            // DCW supports multiple comma-separated 16-bit values
            const vals=operands.map(o=>parseInt(o,16));
            // Return 32-bit combined value or flag for multi-value
            if(vals.length===1) return [vals[0],'DWC',vals];
            // For multiple values, emit each as separate instruction
            // Store extras on the result for the second pass to handle
            return [vals[0],'DWC_M',vals];
        }

        const FULL_REG=new Set(['MOV','CMP','ADD','SUB','BX','BLX']);
        let pattern='', parsed=[];

        if(args.length>0){
            for(const op of operands){
                if(/^R([0-9]|1[0-5])$/.test(op)){
                    const rs=parseInt(op.substring(1));
                    pattern=(rs>7?'H':'R')+pattern; parsed.unshift(rs);
                }else if(op==='SP'){ pattern='S'+pattern; parsed.unshift(13); }
                else if(op==='LR'){ pattern='L'+pattern; parsed.unshift(14); }
                else if(op==='PC'){ pattern='P'+pattern; parsed.unshift(15); }
                else if(op.startsWith('#')){ pattern='O'+pattern; parsed.unshift(parseInt(op.substring(1))); }
                else if(op.startsWith('{')&&op.endsWith('}')){
                    pattern='A'+pattern;
                    let mask=0;
                    for(const r of op.slice(1,-1).split(',')){
                        const t=r.trim();
                        if(t==='LR') mask|=0x100;
                        else if(t==='PC') mask|=0x200;
                        else if(t.startsWith('R')) mask|=(1<<parseInt(t.substring(1)));
                    }
                    parsed.unshift(mask);
                }else if(parseInt(op)+Number.MAX_VALUE){
                    pattern='O'+pattern; parsed.unshift(parseInt(op));
                }else{ parsed.push(op); return [null,mnemonic,parsed]; }
            }
        }

        if(!this.thumbgenMap[mnemonic]||!this.thumbgenMap[mnemonic][pattern]){
            if(FULL_REG.has(mnemonic)){
                pattern=pattern.replaceAll('S','R').replaceAll('P','R').replaceAll('L','R').replaceAll('H','R');
                if(!this.thumbgenMap[mnemonic]||!this.thumbgenMap[mnemonic][pattern])
                    throw Error(`No matching pattern for ${mnemonic} with ${pattern}`);
            }else throw Error(`No matching pattern for ${mnemonic} with ${pattern}`);
        }
        // 分支偏移范围检查 (防止超范围静默截断产生错误跳转)
        // o = target - instAddr (byte offset, 已含 BL 的 curAddr+2 调整)
        if(typeof parsed[0]==='number' && !Number.isNaN(parsed[0])){
            const o=parsed[0];
            if(mnemonic==='B'){
                if(o<-4096||o>4094) throw Error(`B offset ${o} out of range [-4096, 4094]`);
            }else if(mnemonic==='BL'){
                if(o<-4194304||o>4194302) throw Error(`BL offset ${o} out of range [-4194304, 4194302]`);
            }else if(/^B(EQ|NE|CS|CC|MI|PL|VS|VC|HI|LS|GE|LT|GT|LE)$/.test(mnemonic)){
                if(o<-256||o>254) throw Error(`${mnemonic} offset ${o} out of range [-256, 254]`);
            }
        }
        return [this.thumbgenMap[mnemonic][pattern](...parsed), mnemonic, parsed];
    }

    // 字面池岛屿标签序列号 (保证跨递归唯一)
    _litIslSeq = 0;

    // 找到 from 之后的第一条"真实指令"行索引 (跳过 label/注释/.ltorg 等), 用于安全插入岛屿
    _findNextCodeLine(lines, from){
        for(let j=from+1;j<lines.length;j++){
            const t=lines[j].trim();
            if(t===''||t.startsWith(';')) continue;
            if(/^\s*\./.test(t)) continue;        // 伪指令 (.ltorg/.pool/...)
            if(/:/.test(t)) continue;            // label 行
            return j;                            // 第一条真实指令
        }
        return lines.length;                    // 末尾追加
    }

    // assemble multi-line asm to bytes
    parseASM(asm, advaddr=true, _depth=0){
        if(_depth>2000) throw Error('literal island recursion overflow');
        let data=[];
        let asmline=asm.split('\n');
        let litRefs=[]; // declare here for use in post-pass and pool append
        let ltorgLines=[]; // .ltorg line indices, declared here for final pool append

        // 存储每行地址 (供 dumpLineMapping 使用)
        this._lastLineAddrs = new Array(asmline.length).fill(-1);

        if(advaddr){
            // === Pre-pass: detect LDR Rd, =value (supports numeric and labels) ===
            // Also detect .ltorg/.pool directives for inline literal pool flush
            ltorgLines.length = 0;
            for(let i=0;i<asmline.length;i++){
                if(/^\s*\.(ltorg|pool)\s*$/i.test(asmline[i])){
                    ltorgLines.push(i);
                    continue;
                }
                const m=asmline[i].match(/^\s*LDR\s+(R\d+|SP|LR|PC)\s*,\s*=(.+?)$/i);
                if(m){
                    const rd=m[1].toUpperCase();
                    const expr=m[2].trim();
                    // Try numeric first (positive, negative, hex)
                    const numMatch=expr.match(/^(-?)(0x[0-9a-fA-F]+|\d+)$/);
                    if(numMatch){
                        const isNeg=numMatch[1]==='-';
                        const raw=numMatch[2];
                        let val=raw.toLowerCase().startsWith('0x')?parseInt(raw,16):parseInt(raw,10);
                        if(isNeg) val=-val;
                        asmline[i]=`LDR ${rd}, [PC, #0]`; // temp offset
                        // Assign batch: which .ltorg follows this line?
                        let batch = ltorgLines.length; // default: after last .ltorg → end pool
                        for(let b=0;b<ltorgLines.length;b++){
                            if(i<ltorgLines[b]){ batch=b; break; }
                        }
                        litRefs.push({lineIdx:i,rdName:rd,value:val,batch});
                    }else if(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)){
                        // Label reference
                        asmline[i]=`LDR ${rd}, [PC, #0]`; // temp offset
                        let batch = ltorgLines.length;
                        for(let b=0;b<ltorgLines.length;b++){
                            if(i<ltorgLines[b]){ batch=b; break; }
                        }
                        litRefs.push({lineIdx:i,rdName:rd,label:expr.toLowerCase(),batch});
                    }else{
                        throw Error(`Invalid LDR = operand: '${expr}'`);
                    }
                }
            }

            let addrmap={}, bmap=[], nullline=[], addr=0;
            const ltorgAddrs = new Map(); // ltorgLineIdx → address
            const labeltype=new Set(['BIC','BKPT','BX','BLX']);

            // 基地址偏移 (advaddr 为数字时作为基地址, 为 true 时基址=0)
            const baseOff = typeof advaddr === 'number' ? advaddr : 0;

            // Pass 1: collect labels, branch map, and LDR =value instAddrs
            // 字面池去重: 同一 batch 内相同值 (或相同 label) 共享一个池槽, 故频繁复用的
            // 常量只付出 2B/加载 + 4B/槽, 而非每次 6B. 这对大量复用常量是显著的 ROM 节省.
            const refKey = (ref) => (ref.label !== undefined ? 'L:' + ref.label : 'V:' + (ref.value >>> 0));
            const poolSizes = new Array(ltorgLines.length + 1).fill(0);
            const batchKeys = Array.from({length: ltorgLines.length + 1}, () => new Set());
            for(const ref of litRefs) batchKeys[ref.batch].add(refKey(ref));
            for(let b=0;b<batchKeys.length;b++) poolSizes[b] = batchKeys[b].size * 4;

            for(let i=0;i<asmline.length;i++){
                const line=asmline[i];
                if(line.includes(':')) addrmap[line.split(':')[0].trim().toLowerCase()]=addr;

                // Skip .ltorg lines for addr tracking (they produce no code)
                if(ltorgLines.includes(i)){
                    this._lastLineAddrs[i] = baseOff + addr;
                    ltorgAddrs.set(i, addr);
                    // .ltorg 会产生 DCW 池数据, 需要字对齐后跳过池大小
                    const bi=ltorgLines.indexOf(i);
                    if(poolSizes[bi] > 0){
                        const wordAligned = (addr + 3) & ~3; // 池起始地址字对齐 (与 LDR PC-relative 计算一致)
                        addr = wordAligned + poolSizes[bi];   // 跳过 padding + 池数据
                    }
                    continue;
                }

                const ref=litRefs.find(r=>r.lineIdx===i);
                if(ref) ref.instAddr=addr;

                const e=this.encodeThumb(line);
                if(e!=null){
                    this._lastLineAddrs[i] = baseOff + addr;
                    if(e[1]=='BL') addr+=2;
                    if(e[1][0]=='B'&&!labeltype.has(e[1])&&typeof e[2][0]==='string')
                        bmap.push([i,e[2][0].toLowerCase(),addr,line]);
                    addr+=2;
                }else{
                    const cc=line.split(';')[0].trim().toUpperCase().replaceAll('[','').replaceAll(']','');
                    if(/^(BL|B|BEQ|BNE|BCS|BCC|BMI|BPL|BVS|BVC|BHI|BLS|BGE|BLT|BGT|BLE)\s/.test(cc)&&!cc.includes(':')){
                        const parts=cc.split(/\s+/);
                        if(!/^-?\d+$/.test(parts[1])){
                            this._lastLineAddrs[i] = baseOff + addr;
                            bmap.push([i,parts[1].toLowerCase(),addr,line]);
                            addr+= parts[0]==='BL' ? 4 : 2;  // BL takes 4 bytes
                            continue;
                        }
                    }
                    this._lastLineAddrs[i] = -1; // non-code line (label, comment, etc.)
                    nullline.push(i);
                }
            }

            // 暴露标签→地址映射, 供 ThumbBackend.run 精确定位 main 入口 (不依赖 R5 帧指针探测)
            this.addrmap = addrmap;

            // At this point addr is a code-only size.
            // We need the true total address space including final pool.
            const codeOnlyAddr = addr; // code bytes only (without pools)

            // === Resolve LDR =label to numeric addresses ===

            // === Resolve LDR =label to numeric addresses ===
            for(const ref of litRefs){
                if(ref.label!==undefined){
                    const target=addrmap[ref.label];
                    if(target===undefined) throw Error(`Undefined label '${ref.label}' in LDR =`);
                    // pool 存储的是绝对地址, 需加上代码基地址 (advaddr 为 true 时基地址=0)
                    ref.value=target + (typeof advaddr === 'number' ? advaddr : 0);
                    delete ref.label;
                }
            }

            // === Resolve LDR =value literal pool offsets (per batch) ===
            const oobRefs=[]; // 越界 (offset 不在 [4,1020]) 的 LDR 引用, 需要插岛屿
            if(litRefs.length>0){
                const maxBatch = Math.max(...litRefs.map(r=>r.batch));
                for(let b=0;b<=maxBatch;b++){
                    const batchRefs = litRefs.filter(r=>r.batch===b);
                    if(batchRefs.length===0) continue;
                    // Pool position: at .ltorg line for batch b (or at end for last batch)
                    let poolAddr;
                    if(b < ltorgLines.length){
                        poolAddr = (ltorgAddrs.get(ltorgLines[b]) + 3) & ~3; // word-align for LDR PC-relative
                    } else {
                        poolAddr = (addr + 3) & ~3; // word-align after code
                    }
                    const slotMap = new Map(); // refKey -> 共享槽地址 (去重)
                    for(const ref of batchRefs){
                        const k = refKey(ref);
                        let sa = slotMap.get(k);
                        if(sa === undefined){ sa = poolAddr + slotMap.size * 4; slotMap.set(k, sa); }
                        ref.poolAddr = sa;
                        const pcBase=(ref.instAddr+4)&~3; // (PC+4) word-align (LDR PC-relative 需要字对齐)
                        const offset=sa-pcBase; // byte offset (encoder >>2 = word)
                        if(offset<4||offset>1020){
                            oobRefs.push(ref); // 越界: 收集, 稍后插岛屿重汇编
                            continue;
                        }
                        asmline[ref.lineIdx]=`LDR ${ref.rdName}, [PC, #${offset}]`;
                    }
                }
            }

            // === 范围感知散布池: 若某 LDR 够不到本 batch 池 (offset 越界), 在其后插入
            // B @skip / .ltorg(池) / @skip: 岛屿 (B 跳过数据, 始终安全), 然后递归重汇编.
            // 现有程序 (最大 offset << 1020) 不会触发, 故字节数完全不变; 仅大函数 (>1020B) 激活. ===
            if(oobRefs.length>0){
                // 在最前的越界 ref (最小 lineIdx, 最难够到前向池) 之后插入岛屿.
                // 岛屿插在 "下一条真实指令之后" (insAt+1), 使池落在 LDR+8 处, offset=4 合法可达.
                let firstLine=Infinity;
                for(const r of oobRefs) if(r.lineIdx<firstLine) firstLine=r.lineIdx;
                const insAt=this._findNextCodeLine(asmline, firstLine);
                const lbl=`litisl${++this._litIslSeq}`;
                const newAsm=asmline.slice();
                newAsm.splice(insAt+1, 0, `B ${lbl}`, `.ltorg`, `${lbl}:`);
                // 递归前把全部 LDR 还原为 =value 形式 (预扫描曾临时改写为 [PC,#0]),
                // 并按 splice 位移修正索引, 确保递归的预扫描能重新识别所有字面量引用.
                for(const ref of litRefs){
                    const idx = ref.lineIdx > insAt ? ref.lineIdx + 3 : ref.lineIdx;
                    const expr = ref.label!==undefined ? ref.label : '0x'+(ref.value>>>0).toString(16);
                    newAsm[idx] = `LDR ${ref.rdName}, =${expr}`;
                }
                return this.parseASM(newAsm.join('\n'), advaddr, _depth+1);
            }


            // === 长条件分支展开: 条件分支 (Bcc) 目标超出 ±256 时, 用反向条件分支 + 长 B 展开 ===
            // 与字面池岛屿同理: 改写源行后递归重汇编 (restore LDR =value 并重算地址).
            // 例: BEQ target (offset 超界) -> BNE brxln_N / B target / brxln_N:
            //   - 条件成立: BNE 不跳, 落到 B target (长跳转, ±4096) 到达目标.
            //   - 条件不成立: BNE 跳到 brxln_N (紧跟 B 之后, offset=4, 恒在范围内), 顺序继续.
            {
                const COND_INV = {beq:'bne',bne:'beq',bcs:'bcc',bcc:'bcs',bmi:'bpl',bpl:'bmi',
                                  bvs:'bvc',bvc:'bvs',bhi:'bls',bls:'bhi',bge:'blt',blt:'bge',
                                  bgt:'ble',ble:'bgt'};
                const expList=[];
                for(const [idx,label,curAddr] of bmap){
                    const target=addrmap[label];
                    if(target===undefined) continue;
                    const offset=target-curAddr;
                    const m=asmline[idx].split(';')[0].trim().split(/\s+/)[0].toLowerCase();
                    if(COND_INV[m]!==undefined && (offset<-256||offset>254)){
                        expList.push({idx, m, label, skip:`brxln_${++this._litIslSeq}`});
                    }
                }
                if(expList.length>0){
                    // 按 idx 降序插入, 避免行号错位
                    expList.sort((a,b)=>b.idx-a.idx);
                    const newAsm=asmline.slice();
                    for(const e of expList){
                        newAsm[e.idx] = `${COND_INV[e.m].toUpperCase()} ${e.skip}`;
                        newAsm.splice(e.idx+1, 0, `B ${e.label}`, `${e.skip}:`);
                    }
                    // 还原 LDR =value 形式 (与字面池岛屿同样的处理), 并按位移修正索引后递归重汇编.
                    // 每个展开在分支位置插入 2 行 (B target / skip:), 故 lineIdx 大于展开点的 LDR 引用需 +2*count.
                    for(const ref of litRefs){
                        let extra=0;
                        for(const e of expList){ if(e.idx < ref.lineIdx) extra+=2; }
                        const idx = ref.lineIdx + extra;
                        const expr = ref.label!==undefined ? ref.label : '0x'+(ref.value>>>0).toString(16);
                        newAsm[idx] = `LDR ${ref.rdName}, =${expr}`;
                    }
                    return this.parseASM(newAsm.join('\n'), advaddr, _depth+1);
                }
            }

            // Replace labels with computed offsets (case-insensitive)
            for(const [idx,label,curAddr] of bmap){
                const target=addrmap[label];
                if(target!==undefined){
                    const offset=target-curAddr;
                    asmline[idx]=asmline[idx].replace(new RegExp('\\b'+label+'\\b','i'),`${offset}`);
                }
            }

            // === Replace .ltorg lines with inline DCW pool data ===
            for(let bi=0;bi<ltorgLines.length;bi++){
                const li=ltorgLines[bi];
                const batchRefs=litRefs.filter(r=>r.batch===bi);
                if(batchRefs.length===0){
                    asmline[li]=''; // empty line
                    continue;
                }
                // 检查池地址是否需要半字填充以对齐到字边界 (LDR PC-relative 要求字对齐)
                const lAddr = ltorgAddrs.get(li) || 0;
                let poolData = '';
                if(lAddr & 2) poolData = 'DCW 0x0000\n'; // 半字填充
                // 去重: 每个不同 refKey 只发一条 DCW
                const seenKeys = new Set();
                for(const ref of batchRefs){
                    const k = refKey(ref);
                    if(seenKeys.has(k)) continue;
                    seenKeys.add(k);
                    const val=ref.value;
                    const lo=val&0xFFFF;
                    const hi=(val>>>16)&0xFFFF;
                    poolData += `DCW 0x${lo.toString(16).padStart(4,'0')},0x${hi.toString(16).padStart(4,'0')}\n`;
                }
                asmline[li]=poolData.replace(/\n$/,''); // replace .ltorg with DCW lines
            }

            nullline.map(x=>asmline[x]='');
        }

        // Flatten asmline (might have embedded newlines from .ltorg DCW expansion)
        const expanded=[];
        for(const l of asmline){
            if(l.includes('\n')){
                const parts=l.split('\n');
                expanded.push(...parts);
            } else {
                expanded.push(l);
            }
        }
        asmline=expanded;

        const w16=b=>{ data.push(b&0xFF); data.push((b>>8)&0xFF); };

        // Pass 2: generate bytes
        asmline.map(x=>{
            const e=this.encodeThumb(x);
            if(e!=null){
                const v=e[0];
                if(v===null) return; // unresolved label — skip
                if(e[1]==='DWC_M'){ for(const vv of e[2]) w16(vv&0xFFFF); return; }
                if((v&0xFFFF0000)!==0||v<0){ w16(v>>>16); w16(v&0xFFFF); }
                else w16(v&0xFFFF);
            }
        });

        // === Append literal pool (4-byte words) for entries NOT flushed by .ltorg ===
        const lastBatchRefs=litRefs.filter(r=>r.batch===ltorgLines.length);
        if(lastBatchRefs.length>0){
            while(data.length&2){ data.push(0); } // halfword pad
            // 去重: 每个不同 refKey 只写一条池数据
            const seenKeys = new Set();
            for(const ref of lastBatchRefs){
                const k = refKey(ref);
                if(seenKeys.has(k)) continue;
                seenKeys.add(k);
                const val=ref.value;
                w16(val&0xFFFF); w16((val>>>16)&0xFFFF);
            }
        }

        return data;
    }

    // recursive decoder
    decodeThumb(tab,vals,org=0){
        if(tab==null) return `DCW  ${this.Hex16(org)}  ;not found`;
        for(const key of Object.keys(tab)){
            let v=this.bits(vals,key);
            if(!v) continue;
            let next=tab[key][v[1]];
            if(Array.isArray(next)){
                v=this.bits(v[0],next[0]);
                switch(v.length){ case 2: return next[1](v[1]); case 3: return next[1](v[1],v[2]); case 4: return next[1](v[1],v[2],v[3]); }
                return null;
            }else return this.decodeThumb(next,v[0],vals);
        }
    }

    // disassemble bytes to asm
    parseThumb(bin,addrview=false,jmpfix=true){
        let asm=[], addr=0, base=this.baseAddr;
        const dv=new DataView(new Uint8Array(bin).buffer);
        let count=bin.length;
        let dcw=[], qjmp=new Set();

        while(count>=2){
            const code=dv.getUint16(addr,true);
            if(dcw.includes(addr)){
                asm.push(addrview?`:${this.Hex32(base+addr)} ${this.Hex16(code)}  DCW  ${this.Hex16(code)}`:`DCW  ${this.Hex16(code)}`);
                dcw.splice(dcw.indexOf(addr),1);
            }else{
                // BL 是 32 位指令 (前缀 0xF000-0xF7FF + 后缀 0xF800-0xFFFF), 合并为一行显示
                if((code&0xF800)===0xF000 && count>=4){
                    const code2=dv.getUint16(addr+2,true);
                    if((code2&0xF800)===0xF800){
                        this.decodeThumb(this.InstructionsCode,code);   // 前缀: 设置 lastAddr
                        const asmv=this.decodeThumb(this.InstructionsCode,code2); // 后缀: "BL off ;@PC+BL"
                        // 直接从字节计算 BL 真实目标地址 (与 CPU 执行语义一致):
                        // Thumb BL 偏移为 23 位有符号值 = (hi<<12 | lo<<1), 目标 = 指令地址 + 4 + 偏移
                        let s=((code&0x7ff)<<12) | ((code2&0x7ff)<<1);
                        if(s&(1<<22)) s|=~0x3FFFFF;            // 符号扩展到 32 位
                        const lastAddr=(s+4)>>>0;
                        const blBody=asmv.split(';')[0].trim();  // "BL off"
                        let asmv2;
                        if(jmpfix&&(addr+lastAddr)>=0&&(addr+lastAddr)<bin.length){
                            const target=base+addr+lastAddr;
                            const targetHex='0x'+this.Hex32(target);
                            const labelStr=this.AddrName[target]||'';
                            const comment=labelStr?`  ;${labelStr}`:'';
                            asmv2=addrview
                                ? `:${this.Hex32(base+addr)} ${this.Hex16(code)} ${this.Hex16(code2)}  BL   ${targetHex}${comment}`
                                : `BL   ${targetHex}${comment}`;
                            qjmp.add((addr+lastAddr)>>1);
                        }else{
                            asmv2=addrview
                                ? `:${this.Hex32(base+addr)} ${this.Hex16(code)} ${this.Hex16(code2)}  ${blBody}`
                                : `${blBody}`;
                        }
                        asm.push(asmv2.replace(/\s+$/,''));
                        addr+=4;count-=4;
                        continue;
                    }
                }
                let asmv=this.decodeThumb(this.InstructionsCode,code);
                const lastAddr=this.lastAddr;
                let asmv2=addrview?`:${this.Hex32(base+addr)} ${this.Hex16(code)}  ${asmv}`:`${asmv}`;

                if(asmv2.includes(';')){
                    const tag=asmv2.split('@')[1];
                    if(tag==='PC+ADDR'){
                        const vaddr=(addr+lastAddr+4)&~3;
                        dcw.push(vaddr,vaddr+2);
                        asmv2=asmv2.replace('PC+ADDR',
                            `0x${this.Hex32(base+vaddr)}=0x${
                                (vaddr+4<=bin.length)?this.Hex32(dv.getUint32(vaddr,true)):'????????'
                            }`);
                    }else if(tag==='PC+BL'||tag==='PC+B'){
                        if(jmpfix&&(addr+lastAddr)>=0&&(addr+lastAddr)<bin.length){
                            const target=base+addr+lastAddr;
                            const beforeSemi=asmv2.split(';')[0].trim();
                            const mnemonic=beforeSemi.split(/\s+/)[0];
                            const targetHex='0x'+this.Hex32(target);
                            const labelStr=this.AddrName[target]||'';
                            const comment=labelStr?`  ;${labelStr}`:'';
                            const prefix=addrview
                                ? `:${this.Hex32(base+addr)} ${this.Hex16(code)}`
                                : mnemonic;
                            asmv2=`${prefix} ${targetHex}${comment}`;
                            qjmp.add((addr+lastAddr)>>1);
                        }else asmv2=addrview?`:${this.Hex32(base+addr)} ${this.Hex16(code)}  DCW  ${this.Hex16(code)}`:`DCW  ${this.Hex16(code)}`;
                    }
                }
                asm.push(asmv2);
            }
            addr+=2; count-=2;
        }

        if(jmpfix){
            Array.from(qjmp).sort((a,b)=>a-b).reverse().map(x=>{
                const addr='0x'+this.Hex32(base+(x<<1));
                const nm=this.AddrName[base+(x<<1)]||'';
                asm[x]=`${addr}:${nm?'  ;'+nm:''}\n`+asm[x];
            });
        }
        return asm.join('\n').replaceAll(';0\n','');
    }
    /** Convenience: assemble source and load into CPU, return {cpu,bytes} */
    loadAsm(asmSource,cpu=new ThumbCPU(),baseAddr=0){
        const bytes=this.parseASM(asmSource,true);
        cpu.loadProgram(new Uint8Array(bytes),baseAddr,true);
        return {cpu,bytes};
    }
}


const _tacOpSize = op => {
  if(op===80) return 3; // SYS_CALL
  if(op===90) return 2; // CALLR
  if(op===81) return 1; // SYS_MCPY
  if(op===89) return 1; // VM_EXIT
  if(op===67) return 1; // NOP
  if(op===95) return 1; // VB — volatile barrier
  if(op>=59&&op<=66) return [2,3,3,2,1,2,2,2][op-59]; // JMP..ADJ
  if(op===68||op===69) return 3; // LOADH/TAILCALL(68), STOREH(69)
  if(op>=50&&op<=56) return [3,3,3,3,3,3,3][op-50]; // LOAD..MOV
  if(op===57||op===58) return 2; // PUSH,POP
  if(op===70) return 3; // LDA
  if(op===40) return 3;  // CMP rs, rt
  if(op===41) return 3;  // CMPI rs, imm [41,rd,imm]
  if(op>=42&&op<=47) return 2;  // Jcc target
  if(op===48||op===49) return 3; // LOAD_OFF/STORE_OFF
  if(op>=71&&op<=74) return 3; // LOADB_OFF/LOADH_OFF/STOREB_OFF/STOREH_OFF
  return 4; // ALU ops 0-31 + any unassigned
};

const isPow2 = v => v > 0 && (v & (v - 1)) === 0;
const log2 = v => 31 - Math.clz32(v);

// 高寄存器 R8-R12 (Thumb-1 "Hi registers"): 不能做 LDR/STR/ALU-imm 目标, 也不能被
// PUSH/POP. 本后端允许 TAC 寄存器编号 8..12 作为操作数 (由 c4_backend.js 的 D 层
// 寄存器分配器在"无 CALL 活区间"内提升栈槽而来), 所有涉及高寄存器的指令都经低寄存器
// R6/R7 中转, 并在前后 PUSH/POP 保存它们 (R6 是 callee 变量寄存器, R7 是函数指针暂存).
const _isHi = r => r > 7 && r <= 12;

// ---- MOVI 辅助: 加载任意 32 位常量到寄存器 ----
// Thumb M0 只支持 MOV Rd,#imm8 (0-255), 更大值用 LDR =literal 池
let _constFreq = null;   // Map<"funcIdx:val", count> — 由 translateTACtoASM 预扫描填充
let _curFunc = -1;       // 当前函数索引 (遇到 ENTER 推进), 供 emitLoadConst 查本函数常量频率
function emitLoadConst(push, rd, val) {
  // 高寄存器目标: 先在低寄存器 R6 上装载, 再 MOV 到高寄存器 (LDR =const / MOV #imm 不能针对高寄存器)
  if (_isHi(rd)) {
    push('PUSH {R6}');
    emitLoadConst(push, 6, val);
    push(`MOV R${rd}, R6`);
    push('POP {R6}');
    return;
  }
  if (val >= 0 && val < 256) { push(`MOV R${rd}, #${val}`); return; }
  const u = val >>> 0;
  // Thumb-1 没有 MVN #imm (只有 MVNS Rd,Rs). 当 val = ~n (n 为 8-bit, 即高 24 位全 1)
  // 时, 可用 MOV #n + MVNS Rd,Rd 合成, 省掉 1 条 LDR 指令 + 4B 字面池.
  // 但若该常量在本函数被复用 ≥2 次, 共享字面池 (2B/加载 + 4B/槽, 汇编器按值去重)
  // 反而更小, 故仅对"本函数只出现 1 次"的 MVN-able 常量用 MOV+MVNS, 复用的走共享 LDR =const.
  if ((u >>> 8) === 0xFFFFFF) {
    const f = _constFreq ? (_constFreq.get((_curFunc < 0 ? 0 : _curFunc) + ':' + val) | 0) : 1;
    if (f <= 1) {
      push(`MOV R${rd}, #${(~u) & 0xFF}`);
      push(`MVN R${rd}, R${rd}`);
      return;
    }
  }
  if (val > 0) {
    // 检查 byte << (n*8) 模式: 值能否通过 8-bit 立即数左移 n 字节获得
    for (let shift = 0; shift <= 24; shift += 8) {
      const byteVal = (val >>> shift) & 0xFF;
      if (byteVal === 0) continue;
      if ((byteVal << shift) === val) {
        push(`MOV R${rd}, #${byteVal}`);
        if (shift > 0) push(`LSL R${rd}, R${rd}, #${shift}`);
        return;
      }
    }
  }
  push(`LDR R${rd}, =0x${(val >>> 0).toString(16)}`);
}

/** 将立即数加载到 R4 (用于 ALU RI 操作). 大立即数走 LDR 字面池 */
function emitLoadImmR4(push, val) {
  if (val >= 0 && val < 256) { push(`MOV R4, #${val}`); return; }
  const u = val >>> 0;
  if ((u >>> 8) === 0xFFFFFF) {
    push(`MOV R4, #${(~u) & 0xFF}`);
    push(`MVN R4, R4`);
    return;
  }
  push(`LDR R4, =0x${u.toString(16)}`);
}

// ============================================================
// ThumbBackend — TAC → ARM Thumb 后端
// ============================================================
class ThumbBackend extends RegBackend {
  constructor(optLevel, opts) {
    super(optLevel);
    this.asm = null;
    this._debug = false;
    this._cpu = null;
    // ④ 栈帧消除 (默认开启, 已通过全回归验证, O0–O5 ×155 + 外设三写逐字节一致):
    // 用 SP 相对寻址替代 R5=BP 帧指针, 省 2 条 MOV/函数 (PUSH R5 + MOV R5,SP).
    // 关闭: env C4_NO_ELIM_FP=1 或 new ThumbBackend(opt, {elimFramePointer:false}).
    // 兼容旧开关 C4_ELIM_FP=1 (现默认已开, 冗余但保留).
    // 含 ADJ (alloca/多实参清理) 的函数自动回退到 R5 模式 (SP 偏移不恒定).
    // 消除对 process.env 的直接依赖: env -> opts 合并, 显式 opts 优先, 否则取
    // 同名 process.env 环境变量 (方便 shell 调试), 都没有则取默认.
    const env = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const elimFP = (opts && typeof opts.elimFramePointer === 'boolean')
      ? opts.elimFramePointer
      : ('C4_NO_ELIM_FP' in env) ? false
      : ('C4_ELIM_FP' in env) ? true
      : true; // 默认开启
    this.elimFramePointer = elimFP;
    // 汇编窥孔优化总开关 (默认开启). 关闭: env C4_NO_ASMPEEP=1 或
    // new ThumbBackend(opt, {noAsmPeep:true}).
    this.noAsmPeep = (opts && typeof opts.noAsmPeep === 'boolean')
      ? opts.noAsmPeep
      : ('C4_NO_ASMPEEP' in env);
    this.hotConstThreshold = 2;
    // TAC 级冗余 Load 消除会改变指令序列, 影响 Thumb 后端生成的汇编时序
    // 硬件仿真测试 (如 SPI) 依赖精确的指令时序, 此处跳过该 pass
    this._skipRedundantLoad = true;
  }

  // M0 (Cortex-M0, R0-R12) 有高寄存器 R8-R11 可作 D 层反 spill 目标 (经 R6/R7 中转访问);
  // 基础 VM 只有 R0-R7, 故此覆盖仅对 Thumb 后端生效.
  _highRegPool(){ return [8,9,10,11]; }

  // ============================================================
  // 调试对照表: C源码行 → TAC地址 → Thumb汇编
  // ============================================================

  /** 启用 C→ASM 行对照, 保存源码行供后续输出 */
  enableLineMapping(srcCode) {
    this._srcLines = srcCode.split('\n');
    this.srcLineMap = {};
  }

  /** 从 ASM 文本行估算指令字节数 (2 for 16-bit, 4 for BL) */
  _instByteSize(line) {
    const s = line.trim();
    if (!s || s.startsWith(';') || s.endsWith(':') || s.startsWith('.') || s.startsWith('@')) return 0;
    // BL / BL.W 是 32-bit 指令 (排除 BLX)
    if (/^BL(\s|\.W?\s)/i.test(s)) return 4;
    // 其余 Thumb 指令都是 16-bit
    return 2;
  }

  /** 打印 C 源码 ↔ Thumb 汇编对照表 */
  dumpLineMapping() {
    if (!this.srcLineMap || !this._srcLines) { console.log('(no mapping)'); return; }
    if (!this._lastBodyLines || !this._lastCodeBytes) {
      console.log('(no assembled code — call genROM first)');
      return;
    }
    if (!this.asm || !this.asm._lastLineAddrs) {
      console.log('(no line address map — parseASM has not been called)');
      return;
    }

    // body 行在完整 ASM 中的起始索引 (startup + 空行)
    const bodyStartIdx = (this._lastStartupLines || []).length + 1;

    // ---- 扫描 body ASM 行, 建立 srcLine → asmEntries 映射 ----
    const srcToAsm = {};
    let currentSrcLine = -1;

    for (let i = 0; i < this._lastBodyLines.length; i++) {
      const line = this._lastBodyLines[i];
      const trimmed = line.trim();
      const fullIdx = bodyStartIdx + i;

      // 检测 ;@src=X 标记
      const srcMatch = trimmed.match(/^;@src=(\d+)$/);
      if (srcMatch) {
        currentSrcLine = parseInt(srcMatch[1]);
        if (!srcToAsm[currentSrcLine]) srcToAsm[currentSrcLine] = [];
        continue;
      }

      // 跳过注释、标签、.ltorg
      if (!trimmed || trimmed.startsWith(';') || trimmed.endsWith(':') || /^\.(ltorg|pool)\s*$/i.test(trimmed)) continue;

      // 获取地址 (仅实际产生指令的行有有效地址)
      const addr = this.asm._lastLineAddrs[fullIdx];
      if (addr < 0) continue;

      const sz = this._instByteSize(line);
      if (sz === 0) continue;

      // 从 _lastCodeBytes 读取指令的十六进制
      const byteOff = addr - this._lastFullCodeBase;
      let hexBytes = '';
      if (byteOff >= 0 && byteOff + sz <= this._lastCodeBytes.length) {
        for (let hw = 0; hw < sz; hw += 2) {
          const b0 = this._lastCodeBytes[byteOff + hw];
          const b1 = this._lastCodeBytes[byteOff + hw + 1];
          hexBytes += b1.toString(16).padStart(2, '0').toUpperCase()
                    + b0.toString(16).padStart(2, '0').toUpperCase();
        }
      }

      if (currentSrcLine > 0) {
        if (!srcToAsm[currentSrcLine]) srcToAsm[currentSrcLine] = [];
        srcToAsm[currentSrcLine].push({
          addr, hexBytes, text: trimmed,
        });
      }
    }

    // ---- 按源码行号排序输出 ----
    const sortedLines = Object.keys(srcToAsm).map(Number).sort((a, b) => a - b);
    for (const srcLine of sortedLines) {
      const srcCode = (this._srcLines[srcLine - 1] || '').trimEnd();
      const entries = srcToAsm[srcLine];
      console.log(`    ${String(srcLine).padStart(4)}:${srcCode ? ' ' + srcCode : ''}`);
      for (const e of entries) {
        const addrStr = '0x' + e.addr.toString(16).padStart(8, '0').toUpperCase();
        const hexStr = e.hexBytes.padEnd(10);
        console.log(`${addrStr} ${hexStr} ${e.text}`);
      }
    }
  }

  // ================================================================
  // Core TAC→Thumb ASM translation
  // ================================================================
  _translateTACtoASM(code, addr, dataBase, DATAPOS, isGenROM) {
    const lines = [];
    const push = s => { lines.push(s); };
    this._funcEntryLabels = new Set();   // 函数入口标签集合 (供 Pass 2 liveness 跨函数边界判定)
    const enterTacAddrs = new Set();      // ENTER 对应的 TAC 地址 (函数入口)
    let labelId = 0;
    const newLabel = () => `L${labelId++}`;
    const tacLabels = new Map();
    const tacAsmRanges = [];
    let _curTacAddr = 0;
    let _curSrcLine = -1;

    const findLabels = () => {
      const refd = new Set();
      for (let wi = 0; wi < code.length; ) {
        const op2 = code[wi];
        const w1 = code[wi + 1], w2 = code[wi + 2];
        if (op2 === opcode.JMP) refd.add(w1);
        else if (op2 >= opcode.JEQ && op2 <= opcode.JGE) refd.add(w1);
        else if (op2 === opcode.JZ || op2 === opcode.JNZ) refd.add(w2);
        else if (op2 === opcode.CALL || op2 === 68) refd.add(w1);
        wi += _tacOpSize(op2);
      }
      for (let wi = 0; wi < code.length; ) {
        const tacAddr = wi * 4;
        if (refd.has(tacAddr)) tacLabels.set(tacAddr, newLabel());
        wi += _tacOpSize(code[wi]);
      }
    };
    findLabels();

    const entryTac = addr;
    if (!tacLabels.has(entryTac)) tacLabels.set(entryTac, newLabel());
    const entryLabel = tacLabels.get(entryTac);

    // ---- 函数指针: 构建函数入口标签 & fixup 字位置 ----
    const funcEntryLabels = new Map();
    const funcSegOffsets = [];
    this._funcNameLabels = {};           // 函数名 → 入口标签 (供 genROM 求最终地址)
    for (let si = 0; si < this.funcSegments.length; si++) {
      const seg = this.funcSegments[si];
      const label = newLabel();
      funcEntryLabels.set(si, label);
      funcSegOffsets[seg.baseAddr] = si;
      if (seg.name) this._funcNameLabels[seg.name] = label;
    }
    const fixupWordToLabel = new Map();
    for (const fx of this.funcAddrFixups) {
      if (fx._targetSegIdx === undefined || fx.segIdx === undefined) continue;
      const srcSeg = this.funcSegments[fx.segIdx];
      const tgtSegIdx = fx._targetSegIdx;
      if (srcSeg && tgtSegIdx >= 0 && tgtSegIdx < this.funcSegments.length) {
        const moviOpWord = (srcSeg.baseAddr >> 2) + fx.wordPos - 2;
        const funcLabel = funcEntryLabels.get(tgtSegIdx);
        if (funcLabel) fixupWordToLabel.set(moviOpWord, funcLabel);
      }
    }

    // ---- 寄存器映射 ----
    const _isHi = r => r > 7 && r <= 12;
    const _r = r => `R${r}`;
    // 高寄存器安全发射助手: 任何涉及高寄存器 (R8-R12) 的 TAC op 都经低寄存器 R6/R7 中转,
    // 并在前后 PUSH/POP 保存它们, 绝不破坏活的低寄存器 R6(callee 变量)/R7(函数指针暂存).
    const _emit2 = (op, rd, rs) => {
      if (!_isHi(rd) && !_isHi(rs)) { push(`${op} ${_r(rd)}, ${_r(rs)}`); return; }
      const bothHi = _isHi(rd) && _isHi(rs);
      push(bothHi ? 'PUSH {R6, R7}' : 'PUSH {R6}');
      if (!_isHi(rd)) {            // rd 低, rs 高
        push(`MOV R6, R${rs}`); push(`${op} ${_r(rd)}, R6`);
      } else if (!_isHi(rs)) {     // rd 高, rs 低
        push(`MOV R6, R${rd}`); push(`${op} R6, ${_r(rs)}`); push(`MOV R${rd}, R6`);
      } else {                     // 双高
        push(`MOV R6, R${rs}`); push(`MOV R7, R${rd}`); push(`${op} R7, R6`); push(`MOV R${rd}, R7`);
      }
      push(bothHi ? 'POP {R6, R7}' : 'POP {R6}');
    };
    const _emit3 = (op, rd, rs, rt) => {
      if (!_isHi(rd) && !_isHi(rs) && !_isHi(rt)) { push(`${op} ${_r(rd)}, ${_r(rs)}, ${_r(rt)}`); return; }
      push('PUSH {R6, R7}');
      push(`MOV R6, R${rs}`);
      push(`MOV R7, R${rt}`);
      if (!_isHi(rd)) push(`${op} ${_r(rd)}, R6, R7`);
      else { push(`${op} R6, R6, R7`); push(`MOV R${rd}, R6`); }
      push('POP {R6, R7}');
    };
    // 高感知 MOV (rd = rs)
    const _mov = (d, s) => {
      if (!_isHi(d) && !_isHi(s)) push(`MOV R${d}, R${s}`);
      else { push('PUSH {R6}'); push(`MOV R6, R${s}`); push(`MOV R${d}, R6`); push('POP {R6}'); }
    };
    // 高感知 load/store: op 为 LDR/LDRB/LDRH (rd=值, rs=地址) 或 STR/STRB/STRH (v=值, a=地址)
    const _ldStub = (d, s, op) => {
      if (!_isHi(d) && !_isHi(s)) { push(`${op} R${d}, [R${s}, #0]`); return; }
      push('PUSH {R6, R7}'); push(`MOV R6, R${s}`); push(`${op} R7, [R6, #0]`); push(`MOV R${d}, R7`); push('POP {R6, R7}');
    };
    const _stStub = (v, a, op) => {
      if (!_isHi(v) && !_isHi(a)) { push(`${op} R${v}, [R${a}, #0]`); return; }
      push('PUSH {R6, R7}'); push(`MOV R6, R${a}`); push(`MOV R7, R${v}`); push(`${op} R7, [R6, #0]`); push('POP {R6, R7}');
    };
    // 高感知 CMP
    const _cmp2 = (d, s) => {
      if (!_isHi(d) && !_isHi(s)) push(`CMP R${d}, R${s}`);
      else { push('PUSH {R6, R7}'); push(`MOV R6, R${d}`); push(`MOV R7, R${s}`); push(`CMP R6, R7`); push('POP {R6, R7}'); }
    };
    const _cmp0 = (d) => {
      if (!_isHi(d)) push(`CMP R${d}, #0`);
      else { push('PUSH {R6}'); push(`MOV R6, R${d}`); push(`CMP R6, #0`); push('POP {R6}'); }
    };
    // ---- ④ 帧消除辅助: 帧基址寄存器与 SP 模式偏移补偿 ----
    // R5 模式下帧基 = R5; SP 模式下帧基 = SP (且函数体内 SP = F - sz*4, F 为 prologue 后 SP).
    // 同一帧槽的 SP 相对偏移 = R5 模式偏移 + sz*4. 故共用 R5 模式的槽偏移算法, 仅换基址并加 sz*4.
    const _fbr = () => (_curElim ? 'SP' : 'R5');
    // SP 模式偏移补偿 = 局部帧 sz*4 + 挂起的 TAC PUSH 深度*4 (表达式临时值 PUSH/POP 移动 SP;
    // 预扫描 1b 保证深度≠0 区间不跨分支/标签, 故线性补偿是安全的).
    const _fbo = () => (_curElim ? (_curFuncSz * 4 + _tacDepth * 4) : 0);
    // 字寻址: TAC 偏移 rs → 相对帧基的字节偏移 (与 R5 模式同算法); SP 模式另加 sz*4
    const _frameEff = (rs) => {
      let wOff = rs;
      if (wOff > 0 && _curFrameOverhead !== 2) wOff += (_curFrameOverhead - 2);
      // ④ SP 模式 prologue 不压 R5, 正偏移 (栈参数) 比 R5 模式少 1 词.
      // (_curFrameOverhead 恒含 R5 的 +1; 负偏移/0 不受 prologue 布局影响, 不调整)
      if (_curElim && rs > 0) wOff -= 1;
      return wOff * 4 + _fbo();
    };

    // ---- 帧地址 scratch 选择 (活性感知) ----
    // 背景: 负帧偏移 (局部变量, R5 模式) 与 STRB/STRH/SP 模式下, 无法直接 [base,#imm] 寻址,
    //   必须先把有效地址算进一个临时寄存器. 历史实现固定取 `rs===0 ? R1 : R0` —— 隐含假设
    //   "此刻除值寄存器外 R0/R1 皆死". 该假设由 codegen 的 acc=R0 约定巧合成立, 但任何把
    //   STORE_OFF 的值寄存器改写成非 R0 的 TAC pass 都会打破它:
    //   D 段寄存器提升 (peepholeRegAlloc) 插入的出口写回 `STORE_OFF off, Rp` 即是如此 ——
    //   曾致 C4_FULLREG 下 `MOV R1,R0(函数指针); MOV R0,#16; SUB R0,R5,R0` 把活着的函数
    //   指针踩成槽地址, BLX 目标错乱 → 死循环 (multi func ptr 用例 O1-O5 全挂).
    // 现改为: 先在 TAC 层做前向活性扫描, 取一个"下次被写在下次被读之前"的低寄存器;
    //   扫描保守 (遇分支/调用/函数边界即判活), 找不到时退化为 PUSH/POP 保护 —— 恒正确.
    // 注: SP 模式下 PUSH 会使 SP 下移 4B, 故保护路径把 spAdj=4 交给调用方补偿 eff.
    const _tacRegDeadAfter = (reg, from) => {
      const O = opcode;
      let i = from + _tacOpSize(code[from]);
      for (let steps = 0; i < code.length && steps < 48; steps++) {
        const o = code[i];
        // 分支 / 调用 / 函数边界: 后继活性不可线性判定 (调用还隐式使用 R0-R3 传参) → 保守判活
        if (o === O.JMP || o === O.JZ || o === O.JNZ || o === O.CALL || o === O.CALLR ||
            o === O.SYS_CALL || o === O.LEAVE || o === O.RET || o === O.ENTER || o === O.VM_EXIT) return false;
        if (this._useOf(o, i, code).includes(reg)) return false;   // 先被读 → 活
        if (this._defOf(o, i, code) === reg) return true;          // 先被写 → 死
        i += _tacOpSize(o);
      }
      return false;
    };
    // gen(scr, spAdj): 生成使用 scr 的地址计算 + 访存; spAdj 为 SP 模式下需额外补偿的字节数
    const _withScratch = (avoid, gen) => {
      for (const c of [0, 1, 2, 3]) {
        if (avoid.includes(c)) continue;
        if (_tacRegDeadAfter(c, wi)) { gen(c, 0); return; }
      }
      let scr = 0;
      for (const c of [0, 1, 2, 3]) if (!avoid.includes(c)) { scr = c; break; }
      push(`PUSH {R${scr}}`);
      gen(scr, _curElim ? 4 : 0);
      push(`POP {R${scr}}`);
    };
    // 立即数逻辑运算 (ORI/XORI/ANDI): Thumb-1 的 AND/ORR/EOR 无立即数形式, 须把 imm 载入寄存器.
    // 不再固定用 R3 + 强制 PUSH{POP R3} (这曾占满 test4 中 2/3 的 PUSH/POP); 改用 _withScratch 选取
    // 一个"当前已死"的低寄存器作临时, 仅在找不到死寄存器时才退化到 PUSH/POP 保护 —— 与帧地址
    // scratch 复用同一套已验证的活性分析, 恒正确.
    const _logiI = (op, rd, rs, imm) => {
      if (!_isHi(rd) && !_isHi(rs)) {
        _withScratch([rd, rs], (scr) => {
          if (rd !== rs) push(`MOV R${rd}, R${rs}`);
          emitLoadConst(push, scr, imm);
          push(`${op} R${rd}, R${scr}`);
        });
      } else {
        push('PUSH {R6}'); push(`MOV R6, R${rs}`);
        push('PUSH {R3}'); emitLoadConst(push, 3, imm);
        push(`${op} R6, R3`); push(`POP {R3}`);
        push(`MOV R${rd}, R6`); push('POP {R6}');
      }
    };

    const _markTacLines = (tacAddr) => {
      const last = tacAsmRanges.length > 0 ? tacAsmRanges[tacAsmRanges.length - 1] : null;
      if (last && last.tacAddr === tacAddr) return;
      if (last) last.endIdx = lines.length;
      tacAsmRanges.push({ tacAddr, startIdx: lines.length, endIdx: -1 });
    };

    let wi = 0;
    let _funcCount = 0;
    let _curFrameOverhead = 0;
    let _curElim = false;        // 当前函数是否采用 SP 相对帧寻址 (替代 R5=BP)
    let _curFuncSz = 0;          // 当前函数局部帧大小 (槽数), 供 SP 模式偏移补偿
    let _tacDepth = 0;           // 挂起的 TAC PUSH 深度 (SP 模式 [SP,#off] 需按深度补偿)

    // ---- 预扫描 1: 按函数检测是否含 ADJ (alloca / >4 实参清理), 含则禁用帧消除 ----
    const funcHasADJ = new Set();
    {
      let f = -1;
      for (let i = 0; i < code.length; ) {
        const o = code[i];
        if (o === opcode.ENTER) f++;
        else if (o === opcode.ADJ) funcHasADJ.add(f);
        i += _tacOpSize(o);
      }
    }
    // ---- 预扫描 1b: SP 模式安全性 —— TAC PUSH/POP 深度跨分支/跨标签必须为 0 ----
    // ④ SP 相对帧寻址下, TAC 级 PUSH/POP (表达式临时值) 会移动 SP; 线性区间内可静态补偿
    // (_tacDepth), 但若在深度≠0 时遇到跳转指令或跳转目标 (深度无法静态确定), 则该函数
    // 回退 R5 模式. (曾致 O0 数组+临时 PUSH 组合下 [SP,#off] 全部错位 → 结果错误.)
    {
      const jmpTargets = new Set();
      for (let i = 0; i < code.length; ) {
        const o = code[i], w1 = code[i + 1], w2 = code[i + 2];
        if (o === opcode.JMP) jmpTargets.add(w1);
        else if (o >= opcode.JEQ && o <= opcode.JGE) jmpTargets.add(w1);
        else if (o === opcode.JZ || o === opcode.JNZ) jmpTargets.add(w2);
        i += _tacOpSize(o);
      }
      let f = -1, depth = 0;
      for (let i = 0; i < code.length; ) {
        const o = code[i];
        if (o === opcode.ENTER) { f++; depth = 0; }
        else if (o === opcode.PUSH) depth++;
        else if (o === opcode.POP) depth--;
        if (depth !== 0) {
          const isJump = (o === opcode.JMP || o === opcode.JZ || o === opcode.JNZ ||
                          (o >= opcode.JEQ && o <= opcode.JGE));
          if (isJump || jmpTargets.has(i * 4)) funcHasADJ.add(f); // 复用回退集合
        }
        i += _tacOpSize(o);
      }
    }

    // ---- 预扫描 2: 统计每个常量在本函数内的出现次数 ----
    // 目的: MVN-able 常量若本函数只用 1 次 → MOV+MVNS (4B, 无池); 复用 ≥2 次 →
    // 走共享字面池 LDR =const (2B/加载 + 4B/槽, 汇编器按值去重), 反而更小.
    // 其余 (非 MVN-able 大常量) 一律走 LDR =const, 由汇编器去重共享.
    const constFreq = new Map();
    {
      let f = -1;
      for (let i = 0; i < code.length; ) {
        const o = code[i];
        if (o === opcode.ENTER) f++;
        if (o === opcode.MOVI) {
          if (fixupWordToLabel.has(i)) { i += _tacOpSize(o); continue; } // 函数指针走 LDR =label
          const k = f + ':' + code[i + 2];
          constFreq.set(k, (constFreq.get(k) || 0) + 1);
        } else if (o === opcode.LDA) {
          const k = f + ':' + code[i + 2];
          constFreq.set(k, (constFreq.get(k) || 0) + 1);
        } else if (o === opcode.DIVI || o === opcode.MODI || o === opcode.ORI || o === opcode.XORI || o === opcode.ANDI) {
          const k = f + ':' + code[i + 3];
          constFreq.set(k, (constFreq.get(k) || 0) + 1);
        }
        i += _tacOpSize(o);
      }
    }
    _constFreq = constFreq;

    while (wi < code.length) {
      const tacAddr = wi * 4;
      const op = code[wi], rd = code[wi + 1], rs = code[wi + 2], rt = code[wi + 3];
      _markTacLines(tacAddr);
      if (op === opcode.ENTER) { _funcCount++; _curFunc = _funcCount - 1; enterTacAddrs.add(tacAddr); }

      // 记录 C行号→TAC 映射
      if (this.srcLineMap) {
        this.srcLineMap[tacAddr] = this.srcLineMap[tacAddr] || { line: 0, tacAddr, asmLines: [], asmAddr: null };
        const sl = this.srcLineMap[tacAddr].line;
        if (sl > 0 && sl !== _curSrcLine) { _curSrcLine = sl; push(`;@src=${sl}`); }
      }

      // 发射标签
      for (const [si, label] of funcEntryLabels) {
        const seg = this.funcSegments[si];
        if (tacAddr === seg.baseAddr) { push(`${label}:`); this._funcEntryLabels.add(label); break; }
      }
      if (tacAddr === entryTac) { push(`${entryLabel}:`); this._funcEntryLabels.add(entryLabel); }
      if (tacAddr !== entryTac && tacLabels.has(tacAddr)) {
        const lb = tacLabels.get(tacAddr);
        push(`${lb}:`);
        if (enterTacAddrs.has(tacAddr)) this._funcEntryLabels.add(lb);
      }

      switch (op) {
        case opcode.ADD: _emit3('ADD', rd, rs, rt); break;
        case opcode.SUB: _emit3('SUB', rd, rs, rt); break;
        case opcode.MUL: {
          // TAC: rd = rs * rt. Thumb MULS 是 2 操作数 Rd=Rd*Rm, 不能忽略 rt.
          if (!_isHi(rd) && !_isHi(rs) && !_isHi(rt)) {
            if (rd === rs)      push(`MUL ${_r(rd)}, ${_r(rt)}`);
            else if (rd === rt) push(`MUL ${_r(rd)}, ${_r(rs)}`);
            else { push(`MOV ${_r(rd)}, ${_r(rs)}`); push(`MUL ${_r(rd)}, ${_r(rt)}`); }
          } else {
            push('PUSH {R6, R7}'); push(`MOV R6, R${rs}`); push(`MOV R7, R${rt}`);
            push(`MUL R6, R7`); push(`MOV R${rd}, R6`); push('POP {R6, R7}');
          }
          break;
        }
        case opcode.AND: {
          // TAC: rd = rs & rt (commutative). 同上, 避免忽略 rt.
          if (rd === rt)      _emit2('AND', rd, rs);
          else if (rd === rs) _emit2('AND', rd, rt);
          else { push(`MOV ${_r(rd)}, ${_r(rs)}`); _emit2('AND', rd, rt); }
          break;
        }
        case opcode.OR:  {
          if (rd === rt)      _emit2('ORR', rd, rs);
          else if (rd === rs) _emit2('ORR', rd, rt);
          else { push(`MOV ${_r(rd)}, ${_r(rs)}`); _emit2('ORR', rd, rt); }
          break;
        }
        case opcode.XOR: {
          if (rd === rt)      _emit2('EOR', rd, rs);
          else if (rd === rs) _emit2('EOR', rd, rt);
          else { push(`MOV ${_r(rd)}, ${_r(rs)}`); _emit2('EOR', rd, rt); }
          break;
        }
        case opcode.BIC: {
          // TAC: rd = rs & ~rt (BIC, 非交换). 同 AND 须保留 rt.
          if (rd === rs)      _emit2('BIC', rd, rt);   // BIC rd, rt → rd = rd & ~rt (rs==rd 情形)
          else if (rd === rt) {                        // rd = rs & ~rd: 用 R6 中转
            push('PUSH {R6}'); push(`MOV R6, ${_r(rs)}`); push(`BIC R6, ${_r(rd)}`); push(`MOV ${_r(rd)}, R6`); push('POP {R6}');
          } else { push(`MOV ${_r(rd)}, ${_r(rs)}`); _emit2('BIC', rd, rt); }  // rd=rs; BIC rd, rt
          break;
        }

        case opcode.SHL: {
          if (!_isHi(rd) && !_isHi(rs) && !_isHi(rt)) {
            if (rt !== rd && rs !== rd) {
              push(`MOV R${rd}, R${rs}`); push(`LSL R${rd}, R${rt}`);
            } else if (rt === rd && rs === rd) {
              push(`LSL R${rd}, R${rd}`);
            } else {
              push(`MOV R3, R${rt}`); push(`MOV R${rd}, R${rs}`); push(`LSL R${rd}, R3`);
            }
          } else {
            push('PUSH {R6, R7}'); push(`MOV R6, R${rs}`); push(`MOV R7, R${rt}`);
            push(`LSL R6, R7`); push(`MOV R${rd}, R6`); push('POP {R6, R7}');
          }
          break;
        }
        case opcode.SHR: {
          if (!_isHi(rd) && !_isHi(rs) && !_isHi(rt)) {
            if (rt !== rd && rs !== rd) {
              push(`MOV R${rd}, R${rs}`); push(`ASR R${rd}, R${rt}`);
            } else if (rt === rd && rs === rd) {
              push(`ASR R${rd}, R${rd}`);
            } else {
              push(`MOV R3, R${rt}`); push(`MOV R${rd}, R${rs}`); push(`ASR R${rd}, R3`);
            }
          } else {
            push('PUSH {R6, R7}'); push(`MOV R6, R${rs}`); push(`MOV R7, R${rt}`);
            push(`ASR R6, R7`); push(`MOV R${rd}, R6`); push('POP {R6, R7}');
          }
          break;
        }

        case opcode.MOVI: {
          const funcLabel = fixupWordToLabel.get(wi);
          if (funcLabel) {
            push(`LDR ${_r(rd)}, =${funcLabel}`);
          } else {
            emitLoadConst(push, rd, rs);
          }
          break;
        }
        case opcode.LDA: {
          emitLoadConst(push, rd, rs);
          break;
        }
        case opcode.MOV:  _mov(rd, rs); break;

        case opcode.LOAD:   _ldStub(rd, rs, 'LDR'); break;
        case opcode.LOADB:  _ldStub(rd, rs, 'LDRB'); break;
        case opcode.LOADH:  _ldStub(rd, rs, 'LDRH'); break;
        case opcode.STORE:  _stStub(rs, rd, 'STR'); break;
        case opcode.STOREB: _stStub(rs, rd, 'STRB'); break;
        case opcode.STOREH: _stStub(rs, rd, 'STRH'); break;

        case opcode.PUSH: {
          if (!_isHi(rd)) push(`PUSH {R${rd}}`);
          else { push(`MOV R7, R6`); push(`MOV R6, R${rd}`); push(`PUSH {R6}`); push(`MOV R6, R7`); }
          _tacDepth++; // SP 模式帧偏移补偿 (见 _fbo)
          break;
        }
        case opcode.POP: {
          if (!_isHi(rd)) push(`POP {R${rd}}`);
          else { push(`MOV R7, R6`); push(`POP {R6}`); push(`MOV R${rd}, R6`); push(`MOV R6, R7`); }
          _tacDepth--;
          break;
        }

        case opcode.LEA: {
          if (_curElim) {
            // ④ SP 相对: 基址 SP, 偏移 = R5 模式偏移 + sz*4.
            // Thumb-1 约束: ADD/SUB Rd,SP,#imm 立即数范围 ±508 (7bit*4); 负偏移用 SUB 形式.
            const eff = _frameEff(rs);
            const base = _fbr();
            if (!_isHi(rd)) {
              if (eff === 0) push(`MOV R${rd}, ${base}`);
              else if (eff > 0 && eff <= 508) push(`ADD R${rd}, ${base}, #${eff}`);
              else if (eff < 0 && (-eff) <= 508) push(`SUB R${rd}, ${base}, #${-eff}`);
              else { emitLoadConst(push, rd, eff); push(`ADD R${rd}, ${base}, R${rd}`); }
            } else {
              push('PUSH {R6}');
              // 内部 PUSH {R6} 移动了 SP: SP 基址下偏移需 +4 补偿
              const effH = eff + 4;
              if (effH === 0) push(`MOV R6, ${base}`);
              else if (effH > 0 && effH <= 508) push(`ADD R6, ${base}, #${effH}`);
              else if (effH < 0 && (-effH) <= 508) push(`SUB R6, ${base}, #${-effH}`);
              else { emitLoadConst(push, 6, effH); push(`ADD R6, ${base}, R6`); }
              push(`MOV R${rd}, R6`);
              push('POP {R6}');
            }
            break;
          }
          let wOff = rs;
          if (wOff > 0 && _curFrameOverhead !== 2) wOff += (_curFrameOverhead - 2);
          const bOff = wOff * 4;
          if (!_isHi(rd)) {
            if (wOff === 0) push(`MOV R${rd}, R5`);
            else if (wOff > 0 && wOff < 256) { push(`MOV R${rd}, #${bOff}`); push(`ADD R${rd}, R${rd}, R5`); }
            else if (wOff < 0 && (-wOff) < 256) { push(`MOV R${rd}, #${-bOff}`); push(`SUB R${rd}, R5, R${rd}`); }
            else { push(`MOV R${rd}, R5`); push(`ADD R${rd}, R${rd}, #0`); }
          } else {
            if (wOff === 0) push(`MOV R${rd}, R5`);
            else if (wOff > 0 && wOff < 256) { push('PUSH {R6}'); push(`MOV R6, #${bOff}`); push(`ADD R6, R6, R5`); push(`MOV R${rd}, R6`); push('POP {R6}'); }
            else if (wOff < 0 && (-wOff) < 256) { push('PUSH {R6}'); push(`MOV R6, #${-bOff}`); push(`SUB R6, R5, R6`); push(`MOV R${rd}, R6`); push('POP {R6}'); }
            else { push(`MOV R${rd}, R5`); }
          }
          break;
        }

        case opcode.ADDI: {
          if (!_isHi(rd) && !_isHi(rs)) {
            if (rd !== rs) push(`MOV R${rd}, R${rs}`);
            if (rt >= 0 && rt < 256) push(`ADD R${rd}, #${rt}`); else push(`ADD R${rd}, #0`);
          } else {
            push('PUSH {R6}'); push(`MOV R6, R${rs}`);
            if (rt >= 0 && rt < 256) push(`ADD R6, #${rt}`); else push(`ADD R6, #0`);
            push(`MOV R${rd}, R6`); push('POP {R6}');
          }
          break;
        }
        case opcode.SUBI: {
          if (!_isHi(rd) && !_isHi(rs)) {
            if (rd !== rs) push(`MOV R${rd}, R${rs}`);
            let imm = rt;
            if (imm < 0) imm = -imm;
            else if (imm > 0xFFFFFF00) imm = 0x100000000 - imm;
            if (imm >= 0 && imm < 256) push(`SUB R${rd}, #${imm}`); else push(`SUB R${rd}, #0`);
          } else {
            push('PUSH {R6}'); push(`MOV R6, R${rs}`);
            let imm = rt;
            if (imm < 0) imm = -imm;
            else if (imm > 0xFFFFFF00) imm = 0x100000000 - imm;
            if (imm >= 0 && imm < 256) push(`SUB R6, #${imm}`); else push(`SUB R6, #0`);
            push(`MOV R${rd}, R6`); push('POP {R6}');
          }
          break;
        }
        case opcode.MULI: {
          if (!_isHi(rd) && !_isHi(rs)) {
            if (rd !== rs) push(`MOV R${rd}, R${rs}`);
            if (rt === 0) push(`MOV R${rd}, #0`);
            else if (rt === 1) { /* identity */ }
            else if (isPow2(rt) && rt >= 0) {
              push(`LSL R${rd}, R${rd}, #${log2(rt)}`);
            } else if (rt > 0 && rt < 256) {
              push(`MOV R3, #${rt}`); push(`MUL R${rd}, R3`);
            } else {
              push(`MUL R${rd}, R3`); // safety (imm==0 handled above)
            }
          } else {
            push('PUSH {R6, R7}'); push(`MOV R6, R${rs}`);
            if (rt === 0) push(`MOV R6, #0`);
            else if (rt === 1) { /* identity */ }
            else if (isPow2(rt) && rt >= 0) {
              push(`LSL R6, R6, #${log2(rt)}`);
            } else if (rt > 0 && rt < 256) {
              push(`MOV R7, #${rt}`); push(`MUL R6, R7`);
            } else {
              push(`MOV R7, #0`); push(`MUL R6, R7`); // safety
            }
            push(`MOV R${rd}, R6`); push('POP {R6, R7}');
          }
          break;
        }
        case opcode.DIVI: {
          // 通用 TAC: rd = rs / imm  (优化后可能出现 rd !== rs)
          if (rt === 0) { push(`; DIVI by zero`); push(`MOV R${rd}, #0`); }
          else if (rt === 1) { if (rd !== rs) _mov(rd, rs); }
          else {
            if (rd !== rs) _mov(rd, rs);
            push(`PUSH {R2}`);
            emitLoadConst(push, 1, rt);
            push(`MOV R0, R${rd}`);
            push(`PUSH {LR}`); push(`BL __sdiv32`); push(`POP {LR}`);
            push(`MOV R${rd}, R0`); push(`POP {R2}`);
          }
          break;
        }
        case opcode.MODI: {
          // 通用 TAC: rd = rs % imm  (优化后可能出现 rd !== rs)
          if (rt <= 1) push(`MOV R${rd}, #0`);
          else {
            if (rd !== rs) _mov(rd, rs);
            push(`PUSH {R2}`);
            emitLoadConst(push, 1, rt);
            push(`MOV R0, R${rd}`);
            push(`PUSH {R1, R0}`);
            push(`PUSH {LR}`); push(`BL __sdiv32`); push(`POP {LR}`);
            push(`POP {R2, R1}`); push(`MUL R0, R2`); push(`SUB R0, R1, R0`);
            push(`MOV R${rd}, R0`); push(`POP {R2}`);
          }
          break;
        }
        case opcode.SHLI: {
          if (!_isHi(rd) && !_isHi(rs)) {
            if (rd !== rs) push(`MOV R${rd}, R${rs}`);
            if (rt >= 0 && rt < 32) push(`LSL R${rd}, R${rd}, #${rt}`); else push(`LSL R${rd}, R${rd}, #0`);
          } else {
            push('PUSH {R6}'); push(`MOV R6, R${rs}`);
            if (rt >= 0 && rt < 32) push(`LSL R6, R6, #${rt}`); else push(`LSL R6, R6, #0`);
            push(`MOV R${rd}, R6`); push('POP {R6}');
          }
          break;
        }
        case opcode.SHRI: {
          if (!_isHi(rd) && !_isHi(rs)) {
            if (rd !== rs) push(`MOV R${rd}, R${rs}`);
            if (rt >= 0 && rt < 32) push(`ASR R${rd}, R${rd}, #${rt}`); else push(`ASR R${rd}, R${rd}, #0`);
          } else {
            push('PUSH {R6}'); push(`MOV R6, R${rs}`);
            if (rt >= 0 && rt < 32) push(`ASR R6, R6, #${rt}`); else push(`ASR R6, R6, #0`);
            push(`MOV R${rd}, R6`); push('POP {R6}');
          }
          break;
        }
        case opcode.ORI:  _logiI('ORR', rd, rs, rt); break;
        case opcode.XORI: {
          if (rt === -1) {
            if (!_isHi(rd) && !_isHi(rs)) push(`MVN R${rd}, R${rs}`);
            else { push('PUSH {R6}'); push(`MOV R6, R${rs}`); push(`MVN R6, R6`); push(`MOV R${rd}, R6`); push('POP {R6}'); }
          } else _logiI('EOR', rd, rs, rt);
          break;
        }
        case opcode.ANDI: {
          if (rt === 0) {
            if (!_isHi(rd)) push(`MOV R${rd}, #0`);
            else { push('PUSH {R6}'); push(`MOV R6, #0`); push(`MOV R${rd}, R6`); push('POP {R6}'); }
          } else _logiI('AND', rd, rs, rt);
          break;
        }

        case opcode.CMP:  _cmp2(rd, rs); break;
        case opcode.CMPI: {
          if (!_isHi(rd)) push(`CMP R${rd}, #${rs}`);
          else { push('PUSH {R6}'); push(`MOV R6, R${rd}`); push(`CMP R6, #${rs}`); push('POP {R6}'); }
          break;
        }
        case opcode.JEQ: { const t = tacLabels.get(rd); if (t) push(`BEQ ${t}`); break; }
        case opcode.JNE: { const t = tacLabels.get(rd); if (t) push(`BNE ${t}`); break; }
        case opcode.JLT: { const t = tacLabels.get(rd); if (t) push(`BLT ${t}`); break; }
        case opcode.JGT: { const t = tacLabels.get(rd); if (t) push(`BGT ${t}`); break; }
        case opcode.JLE: { const t = tacLabels.get(rd); if (t) push(`BLE ${t}`); break; }
        case opcode.JGE: { const t = tacLabels.get(rd); if (t) push(`BGE ${t}`); break; }

        case opcode.LOAD_OFF: {
          if (_curElim) {
            // ④ SP 相对. 字寻址 [SP,#imm] 合法范围 0..1020; 负偏移/越界用寄存器算地址.
            const eff = _frameEff(rs);
            const base = _fbr();
            if (!_isHi(rd)) {
              if (eff >= 0 && eff <= 1020) push(`LDR R${rd}, [${base}, #${eff}]`);
              else if (eff > 0 && eff <= 508) { push(`ADD R${rd}, ${base}, #${eff}`); push(`LDR R${rd}, [R${rd}, #0]`); }
              else if (eff < 0 && (-eff) <= 508) { push(`SUB R${rd}, ${base}, #${-eff}`); push(`LDR R${rd}, [R${rd}, #0]`); }
              else { emitLoadConst(push, rd, eff); push(`ADD R${rd}, ${base}, R${rd}`); push(`LDR R${rd}, [R${rd}, #0]`); }
            } else {
              push('PUSH {R6, R7}');
              // 内部 PUSH {R6,R7} 移动了 SP: SP 基址下偏移需 +8 补偿
              const effH = eff + 8;
              if (effH >= 0 && effH <= 1020) push(`LDR R7, [${base}, #${effH}]`);
              else if (effH > 0 && effH <= 508) { push(`ADD R6, ${base}, #${effH}`); push(`LDR R7, [R6, #0]`); }
              else if (effH < 0 && (-effH) <= 508) { push(`SUB R6, ${base}, #${-effH}`); push(`LDR R7, [R6, #0]`); }
              else { emitLoadConst(push, 6, effH); push(`ADD R6, ${base}, R6`); push(`LDR R7, [R6, #0]`); }
              push(`MOV R${rd}, R7`);
              push('POP {R6, R7}');
            }
            break;
          }
          if (!_isHi(rd)) {
            let sOff = rs;
            if (sOff > 0 && _curFrameOverhead !== 2) sOff += (_curFrameOverhead - 2);
            const bOff = sOff * 4;
            if (bOff === 0) push(`LDR R${rd}, [R5, #0]`);
            else if (bOff > 0 && bOff < 1024) push(`LDR R${rd}, [R5, #${bOff}]`);
            else if (bOff < 0) {
              const abs = -bOff;
              if (abs < 8) push(`SUBS R${rd}, R5, #${abs}`);
              else if (abs < 256) { push(`MOV R${rd}, #${abs}`); push(`SUB R${rd}, R5, R${rd}`); }
              else { emitLoadConst(push, rd, abs); push(`SUB R${rd}, R5, R${rd}`); }
              push(`LDR R${rd}, [R${rd}, #0]`);
            } else push(`STR R${rd}, [R5]`); // safety (should not happen)
          } else {
            // rd 高: LDR 不能针对高寄存器, 经 R6(地址)/R7(值) 中转
            let sOff = rs;
            if (sOff > 0 && _curFrameOverhead !== 2) sOff += (_curFrameOverhead - 2);
            const bOff = sOff * 4;
            push('PUSH {R6, R7}');
            if (bOff === 0) push(`LDR R7, [R5, #0]`);
            else if (bOff > 0 && bOff < 1024) push(`LDR R7, [R5, #${bOff}]`);
            else if (bOff < 0) {
              const abs = -bOff;
              if (abs < 8) push(`SUBS R6, R5, #${abs}`);
              else if (abs < 256) { push(`MOV R6, #${abs}`); push(`SUB R6, R5, R6`); }
              else { emitLoadConst(push, 6, abs); push(`SUB R6, R5, R6`); }
              push(`LDR R7, [R6, #0]`);
            } else push(`STR R7, [R5]`);
            push(`MOV R${rd}, R7`);
            push('POP {R6, R7}');
          }
          break;
        }
        case opcode.STORE_OFF: {
          if (_curElim) {
            // ④ SP 相对: 偏移字段在 rd (STORE_OFF off,rs). 字寻址 [SP,#imm] 0..1020.
            const eff = _frameEff(rd);
            const base = _fbr();
            const v = rs;
            if (eff >= 0 && eff <= 1020) push(`STR R${v}, [${base}, #${eff}]`);
            else {
              // 计算地址到临时寄存器 (须是活性上安全的; 见 _withScratch); 不改 SP (保护路径除外, 用 adj 补偿).
              _withScratch([v], (scr, adj) => {
                const e = eff + adj;
                if (e > 0 && e <= 508) push(`ADD R${scr}, ${base}, #${e}`);
                else if (e < 0 && (-e) <= 508) push(`SUB R${scr}, ${base}, #${-e}`);
                else { emitLoadConst(push, scr, e); push(`ADD R${scr}, ${base}, R${scr}`); }
                push(`STR R${v}, [R${scr}, #0]`);
              });
            }
            break;
          }
          if (!_isHi(rs)) {
            let sOff2 = rd;
            if (sOff2 > 0 && _curFrameOverhead !== 2) sOff2 += (_curFrameOverhead - 2);
            const bOff2 = sOff2 * 4;
            if (bOff2 === 0) push(`STR R${rs}, [R5, #0]`);
            else if (bOff2 > 0 && bOff2 < 1024) push(`STR R${rs}, [R5, #${bOff2}]`);
            else if (bOff2 < 0) {
              const abs2 = -bOff2;
              // scratch 须避开值寄存器 rs 且活性安全 (R5 模式 PUSH 不影响 R5 基址, adj 忽略)
              _withScratch([rs], (scr) => {
                if (abs2 < 8) push(`SUBS R${scr}, R5, #${abs2}`);
                else if (abs2 < 256) { push(`MOV R${scr}, #${abs2}`); push(`SUB R${scr}, R5, R${scr}`); }
                else { emitLoadConst(push, scr, abs2); push(`SUB R${scr}, R5, R${scr}`); }
                push(`STR R${rs}, [R${scr}, #0]`);
              });
            } else push(`STR R${rs}, [R5, #0]`); // safety
          } else {
            // rs 高: STR 不能针对高寄存器, 经 R6(地址)/R7(值) 中转
            let sOff2 = rd;
            if (sOff2 > 0 && _curFrameOverhead !== 2) sOff2 += (_curFrameOverhead - 2);
            const bOff2 = sOff2 * 4;
            push('PUSH {R6, R7}');
            push(`MOV R7, R${rs}`);
            if (bOff2 === 0) push(`STR R7, [R5, #0]`);
            else if (bOff2 > 0 && bOff2 < 1024) push(`STR R7, [R5, #${bOff2}]`);
            else if (bOff2 < 0) {
              const abs2 = -bOff2;
              if (abs2 < 8) push(`SUBS R6, R5, #${abs2}`);
              else if (abs2 < 256) { push(`MOV R6, #${abs2}`); push(`SUB R6, R5, R6`); }
              else { emitLoadConst(push, 6, abs2); push(`SUB R6, R5, R6`); }
              push(`STR R7, [R6, #0]`);
            } else push(`STR R7, [R5, #0]`);
            push('POP {R6, R7}');
          }
          break;
        }
        case opcode.LOADB_OFF: {
          if (_curElim) {
            // ④ SP 相对 (字节寻址无 _curFrameOverhead 调整, 偏移 = rs*4 + sz*4).
            // 注意: LDRB/STRB/LDRH/STRH 的基址寄存器不能是 SP (Thumb-1 限制), 故一律算地址到寄存器.
            const eff = rs * 4 + _fbo();
            if (eff === 0) push(`ADD R${rd}, SP, #0`);
            else if (eff > 0 && eff <= 508) push(`ADD R${rd}, SP, #${eff}`);
            else if (eff < 0 && (-eff) <= 508) push(`SUB R${rd}, SP, #${-eff}`);
            else { emitLoadConst(push, rd, eff); push(`ADD R${rd}, SP, R${rd}`); }
            push(`LDRB R${rd}, [R${rd}, #0]`);
            break;
          }
          const bB = rs * 4;
          if (bB >= 0 && bB < 32) push(`LDRB R${rd}, [R5, #${bB}]`);
          else if (bB < 0 && (-bB) < 256) { push(`SUBS R${rd}, R5, #${-bB}`); push(`LDRB R${rd}, [R${rd}, #0]`); }
          else if (bB < 0) { emitLoadConst(push, rd, -bB); push(`SUB R${rd}, R5, R${rd}`); push(`LDRB R${rd}, [R${rd}, #0]`); }
          else push(`LDRB R${rd}, [R5, #0]`); // safety
          break;
        }
        case opcode.LOADH_OFF: {
          if (_curElim) {
            // ④ SP 相对; LDRH 基址不能用 SP, 算地址到 rd (目的, 可覆盖).
            const eff = rs * 4 + _fbo();
            if (eff === 0) push(`ADD R${rd}, SP, #0`);
            else if (eff > 0 && eff <= 508) push(`ADD R${rd}, SP, #${eff}`);
            else if (eff < 0 && (-eff) <= 508) push(`SUB R${rd}, SP, #${-eff}`);
            else { emitLoadConst(push, rd, eff); push(`ADD R${rd}, SP, R${rd}`); }
            push(`LDRH R${rd}, [R${rd}, #0]`);
            break;
          }
          const bH = rs * 4;
          if (bH >= 0 && bH < 64 && (bH & 1) === 0) push(`LDRH R${rd}, [R5, #${bH}]`);
          else if (bH < 0 && (-bH) < 256) { push(`SUBS R${rd}, R5, #${-bH}`); push(`LDRH R${rd}, [R${rd}, #0]`); }
          else if (bH < 0) { emitLoadConst(push, rd, -bH); push(`SUB R${rd}, R5, R${rd}`); push(`LDRH R${rd}, [R${rd}, #0]`); }
          else push(`LDRH R${rd}, [R5, #0]`); // safety
          break;
        }
        case opcode.STOREB_OFF: {
          if (_curElim) {
            // ④ SP 相对; STRB 基址不能用 SP. 用临时寄存器(避开值寄存器 rs)算地址, 不改 SP.
            const eff = rd * 4 + _fbo();
            _withScratch([rs], (scr, adj) => {
              const e = eff + adj;
              if (e === 0) push(`ADD R${scr}, SP, #0`);
              else if (e > 0 && e <= 508) push(`ADD R${scr}, SP, #${e}`);
              else if (e < 0 && (-e) <= 508) push(`SUB R${scr}, SP, #${-e}`);
              else { emitLoadConst(push, scr, e); push(`ADD R${scr}, SP, R${scr}`); }
              push(`STRB R${rs}, [R${scr}, #0]`);
            });
            break;
          }
          const bSB = rd * 4;
          if (bSB >= 0 && bSB < 32) push(`STRB R${rs}, [R5, #${bSB}]`);
          else if (bSB < 0 && (-bSB) < 256) {
            _withScratch([rs], (scr) => { push(`SUBS R${scr}, R5, #${-bSB}`); push(`STRB R${rs}, [R${scr}, #0]`); });
          }
          else if (bSB < 0) { _withScratch([rs], (scr) => { emitLoadConst(push, scr, -bSB); push(`SUB R${scr}, R5, R${scr}`); push(`STRB R${rs}, [R${scr}, #0]`); }); }
          else push(`STRB R${rs}, [R5, #0]`); // safety
          break;
        }
        case opcode.STOREH_OFF: {
          if (_curElim) {
            // ④ SP 相对; STRH 基址不能用 SP. 用临时寄存器(避开值寄存器 rs)算地址, 不改 SP.
            const eff = rd * 4 + _fbo();
            _withScratch([rs], (scr, adj) => {
              const e = eff + adj;
              if (e === 0) push(`ADD R${scr}, SP, #0`);
              else if (e > 0 && e <= 508) push(`ADD R${scr}, SP, #${e}`);
              else if (e < 0 && (-e) <= 508) push(`SUB R${scr}, SP, #${-e}`);
              else { emitLoadConst(push, scr, e); push(`ADD R${scr}, SP, R${scr}`); }
              push(`STRH R${rs}, [R${scr}, #0]`);
            });
            break;
          }
          const bSH = rd * 4;
          if (bSH >= 0 && bSH < 64 && (bSH & 1) === 0) push(`STRH R${rs}, [R5, #${bSH}]`);
          else if (bSH < 0 && (-bSH) < 256) {
            _withScratch([rs], (scr) => { push(`SUBS R${scr}, R5, #${-bSH}`); push(`STRH R${rs}, [R${scr}, #0]`); });
          }
          else if (bSH < 0) { _withScratch([rs], (scr) => { emitLoadConst(push, scr, -bSH); push(`SUB R${scr}, R5, R${scr}`); push(`STRH R${rs}, [R${scr}, #0]`); }); }
          else push(`STRH R${rs}, [R5, #0]`); // safety
          break;
        }

        case opcode.EQI: {
          // 注意: rd 可能等于 rs (如 EQI acc,acc,1), MOV Rd,#0 不得在 CMP 前
          const se = newLabel(), sd = newLabel();
          push(`CMP R${rs}, #${rt}`); push(`BNE ${se}`);
          push(`MOV R${rd}, #1`); push(`B ${sd}`);
          push(`${se}: MOV R${rd}, #0`); push(`${sd}:`);
          break;
        }
        case opcode.NEI: {
          const se = newLabel(), sd = newLabel();
          push(`CMP R${rs}, #${rt}`); push(`BEQ ${se}`);
          push(`MOV R${rd}, #1`); push(`B ${sd}`);
          push(`${se}: MOV R${rd}, #0`); push(`${sd}:`);
          break;
        }
        case opcode.LTI: {
          const se = newLabel(), sd = newLabel();
          push(`CMP R${rs}, #${rt}`); push(`BGE ${se}`);
          push(`MOV R${rd}, #1`); push(`B ${sd}`);
          push(`${se}: MOV R${rd}, #0`); push(`${sd}:`);
          break;
        }
        case opcode.GTI: {
          const se = newLabel(), sd = newLabel();
          push(`CMP R${rs}, #${rt}`); push(`BLE ${se}`);
          push(`MOV R${rd}, #1`); push(`B ${sd}`);
          push(`${se}: MOV R${rd}, #0`); push(`${sd}:`);
          break;
        }
        case opcode.LEI: {
          const se = newLabel(), sd = newLabel();
          push(`CMP R${rs}, #${rt}`); push(`BGT ${se}`);
          push(`MOV R${rd}, #1`); push(`B ${sd}`);
          push(`${se}: MOV R${rd}, #0`); push(`${sd}:`);
          break;
        }
        case opcode.GEI: {
          const se = newLabel(), sd = newLabel();
          push(`CMP R${rs}, #${rt}`); push(`BLT ${se}`);
          push(`MOV R${rd}, #1`); push(`B ${sd}`);
          push(`${se}: MOV R${rd}, #0`); push(`${sd}:`);
          break;
        }

        case opcode.JMP: { const t = tacLabels.get(rd); if (t) push(`B ${t}`); break; }
        case opcode.JZ:  { const t = tacLabels.get(rs); _cmp0(rd); if (t) push(`BEQ ${t}`); break; }
        case opcode.JNZ: { const t = tacLabels.get(rs); _cmp0(rd); if (t) push(`BNE ${t}`); break; }
        case opcode.CALL: { const t = tacLabels.get(rd); if (t) push(`BL ${t}`); break; }
        case 68: { const t = tacLabels.get(rd); if (t) push(`B ${t}`); break; }

        case opcode.RET:
          if (_curElim) {
            // 死代码: 本编译器 (codegen) 不发 RET, 仅 VM 兼容保留. SP 模式安全兜底:
            if (_curFuncSz > 0) push(`ADD SP, #${_curFuncSz * 4}`);
            push(`POP {PC}`);
          } else {
            push(`MOV SP, R5`); push(`POP {R5, PC}`);
          }
          break;

        case opcode.ENTER: {
          const sz = rd & 0xFF;
          const calleeMask = (rd >> 8) & 0xFF;
          const isLeaf = (rd >> 16) & 1;
          _curFrameOverhead = 1; // R5
          if(calleeMask & 0x10) _curFrameOverhead++;
          if(calleeMask & 0x40) _curFrameOverhead++;
          if(calleeMask & 0x80) _curFrameOverhead++;
          if(!isLeaf) _curFrameOverhead++;
          _curFuncSz = sz;
          _tacDepth = 0;
          _curElim = this.elimFramePointer && !funcHasADJ.has(_curFunc);
          if (_curElim) {
            // ④ SP 相对帧寻址: 不保存 R5, 不 MOV R5,SP; prologue 仅 push callee/LR (空列表则不推)
            let pushList = '';
            if(calleeMask & 0x10) pushList += 'R4, ';
            if(calleeMask & 0x40) pushList += 'R6, ';
            if(calleeMask & 0x80) pushList += 'R7, ';
            if(!isLeaf) pushList += 'LR';
            pushList = pushList.replace(/,\s*$/, '');
            if (pushList) push(`PUSH {${pushList}}`);
            if (sz > 0) {
              const sub = sz * 4;
              push(`SUB SP, #${sub}`); // TAC 保证 sz*4 < 508 (否则帧过大)
            }
          } else {
            let pushList = 'R5';
            if(calleeMask & 0x10) pushList += ', R4';
            if(calleeMask & 0x40) pushList += ', R6';
            if(calleeMask & 0x80) pushList += ', R7';
            if(!isLeaf) pushList += ', LR';
            push(`PUSH {${pushList}}`);
            push(`MOV R5, SP`);
            if (sz > 0) {
              const sub = sz * 4;
              push(`SUB SP, #${sub}`); // TAC 保证 sz*4 < 508 (否则帧过大)
            }
          }
          break;
        }
        case opcode.LEAVE: {
          const leaveMask = rd & 0xFF;
          const isLeaf = (rd >> 8) & 1;
          if (_curElim) {
            // ④ SP 相对帧: 先回收局部帧 (ADD SP,#sz*4), 再 POP callee/LR, 不含 R5
            if (_curFuncSz > 0) push(`ADD SP, #${_curFuncSz * 4}`);
            let popList = '';
            if(leaveMask & 0x10) popList += 'R4, ';
            if(leaveMask & 0x40) popList += 'R6, ';
            if(leaveMask & 0x80) popList += 'R7, ';
            popList = popList.replace(/,\s*$/, '');
            if (isLeaf) {
              if (popList) push(`POP {${popList}}`);
              push(`BX LR`);
            } else {
              popList += (popList ? ', ' : '') + 'PC';
              push(`POP {${popList}}`);
            }
          } else {
            push(`MOV SP, R5`);
            let popList = 'R5';
            if(leaveMask & 0x10) popList += ', R4';
            if(leaveMask & 0x40) popList += ', R6';
            if(leaveMask & 0x80) popList += ', R7';
            if(isLeaf) {
              push(`POP {${popList}}`);
              push(`BX LR`);
            } else {
              popList += ', PC';
              push(`POP {${popList}}`);
            }
          }
          push('.ltorg'); // 在函数结尾发射常量池，确保不干扰下一函数的入口标签
          break;
        }
        case opcode.ADJ: {
          const adj = rd * 4;
          if (adj >= 0 && adj < 508 && (adj & 3) === 0) push(`ADD SP, #${adj}`);
          else if (adj < 0 && (-adj) < 508 && ((-adj) & 3) === 0) push(`SUB SP, #${(-adj)}`);
          else push(`ADD SP, #0`); // safety
          break;
        }
        case opcode.CALLR: {
          const rn = rd;
          // ORR 是幂等的: fp|1 == fp+1, (fp+1)|1 == fp+1
          // 使用 R0 (caller-saved) 做 scratch + PUSH/POP 保护
          push(`PUSH {R0}`); push(`MOV R0, #1`); push(`ORR R${rn}, R0`); push(`POP {R0}`); push(`BLX R${rn}`);
          break;
        }
        case opcode.SYS_CALL:
          push(`MOV R0, #${rd}`); push(`MOV R1, #${rs}`); push(`SWI ${rd}`);
          break;
        case opcode.VM_EXIT:
          push(`SWI 0xFF`);
          break;
        case opcode.NOP:
          push(`NOP`);
          break;
        case opcode.VB:
          // VB — volatile barrier: TAC 级优化屏障, ASM 级无副作用 → NOP
          push(`NOP`);
          break;

        case opcode.EQ: case opcode.NE: case opcode.LT: case opcode.GT: case opcode.LE: case opcode.GE: {
          // RR 形式: CMP 必须在 MOV Rd,#0 之前, 否则 MOV 覆盖 rd (同时也可能是第二源)
          const cond = ['EQ','NE','LT','GT','LE','GE'][op - opcode.EQ];
          const invCond = {'EQ':'NE','NE':'EQ','LT':'GE','GT':'LE','LE':'GT','GE':'LT'}[cond];
          const set0 = newLabel(), done = newLabel();
          push(`CMP R${rs}, R${rt}`);
          push(`B${invCond} ${set0}`);
          push(`MOV R${rd}, #1`); push(`B ${done}`);
          push(`${set0}: MOV R${rd}, #0`); push(`${done}:`);
          break;
        }

        case opcode.DIV: {
          push(`PUSH {LR}`);            // save LR (avoid clobbering R6)
          push(`PUSH {R2}`);
          push(`PUSH {R${rs}}`);        // save dividend (handles aliasing)
          push(`MOV R1, R${rt}`);       // R1 = divisor
          push(`POP {R0}`);             // R0 = dividend
          push(`BL __sdiv32`);
          push(`MOV R${rd}, R0`);
          push(`POP {R2}`);
          push(`POP {LR}`);             // restore LR
          break;
        }
        case opcode.MOD: {
          // Compute rd = rs MOD rt
          // Push dividend to stack first, then set up R0/R1 for __sdiv32, then compute remainder
          push(`PUSH {LR}`);            // save LR (avoid clobbering R6)
          push(`PUSH {R2}`);
          push(`PUSH {R${rs}}`);        // stack: [R6,R2,LR,divd]; save dividend
          push(`MOV R1, R${rt}`);       // R1 = divisor
          push(`POP {R0}`);             // R0 = dividend (pop from step above)
          push(`PUSH {R0}`);            // re-save dividend for later
          push(`PUSH {R1}`);            // save divisor
          push(`BL __sdiv32`);          // R0 = quotient
          push(`POP {R1}`);             // R1 = divisor (stack: [R2,LR,divd])
          push(`POP {R2}`);             // R2 = dividend (stack: [R2,LR])
          push(`MUL R0, R1`);           // R0 = quotient * divisor
          push(`SUB R0, R2, R0`);       // R0 = dividend - (quotient*divisor) = remainder
          push(`MOV R${rd}, R0`);
          push(`POP {R2}`);             // restore R2
          push(`POP {LR}`);             // restore LR
          break;
        }
        default: {
          const sz = _tacOpSize(op);
          for (let i = 0; i < sz; i++) push(`NOP ; unsupported op ${op}`);
          break;
        }
      }
      wi += _tacOpSize(op);
    }
    if (tacAsmRanges.length > 0) tacAsmRanges[tacAsmRanges.length - 1].endIdx = lines.length;
    _constFreq = null; _curFunc = -1; // 清理模块级状态, 避免影响后续编译
    return { lines, entryLabel, tacLabels, tacAsmRanges, needsDiv: (() => {
      for (let wi = 0; wi < code.length; wi += _tacOpSize(code[wi])) {
        const op = code[wi];
        if (op === opcode.DIV || op === opcode.MOD || op === opcode.DIVI || op === opcode.MODI) return true;
      }
      return false;
    })() };
  }

  // ================================================================
  // 窥孔优化 — 对生成的 ASM 文本行做后处理
  // ================================================================
  _peephole(lines) {
    lines = lines.slice();
    let changed = true;

    /** 检查一行 ASM 指令是否写入给定寄存器 (作为目的操作数) */
    const _instWritesReg = (line, r) => {
      const s = line.trim();
      if (!s || s.startsWith(';') || s.endsWith(':') || s.startsWith('.') || s.startsWith('@')) return false;
      const inst = s.replace(/^[^:]+:\s*/, '').trim();
      const opM = inst.match(/^([A-Z]+)\b/i);
      if (!opM) return false;
      const op = opM[1].toUpperCase();
      // 不写入目的操作数的指令
      const ro = ['CMP','CMN','STR','STRB','STRH','B','BEQ','BNE','BLT','BGT','BLE','BGE',
                  'BL','BLX','BX','CBZ','CBNZ','SWI','NOP','PUSH'];
      if (ro.includes(op)) return false;
      const ops = inst.slice(opM[0].length).trim();
      const firstOp = ops.split(',')[0].trim();
      return firstOp === `R${r}` || firstOp.startsWith(`{R${r}`) || firstOp.endsWith(`R${r}}`);
    };

    /** 检查一行 ASM 指令是否读取给定寄存器 (作为源操作数) */
    const _instReadsReg = (line, r) => {
      const s = line.trim();
      if (!s || s.startsWith(';') || s.endsWith(':') || s.startsWith('.') || s.startsWith('@')) return false;
      const inst = s.replace(/^[^:]+:\s*/, '').trim();
      const opM = inst.match(/^([A-Z][A-Z0-9]*)\b/i);
      if (!opM) return false;
      const op = opM[1].toUpperCase();
      if (['B','BEQ','BNE','BLT','BGT','BLE','BGE','SWI','NOP'].includes(op)) return false;
      const operandStr = inst.slice(opM[0].length).trim();
      const ops = []; let d = 0, cur = '';
      for (const ch of operandStr) { if (ch === '[') d++; else if (ch === ']') d--; if (ch === ',' && d === 0) { ops.push(cur.trim()); cur = ''; } else cur += ch; }
      if (cur.trim()) ops.push(cur.trim());
      let srcIdx = [];
      if (op === 'STR' || op === 'STRB' || op === 'STRH' || op === 'PUSH') srcIdx = ops.map((_, k) => k);
      else if (op === 'CMP' || op === 'CMN' || op === 'TST' || op === 'BX' || op === 'BL' || op === 'BLX') srcIdx = ops.map((_, k) => k);
      else if (ops.length >= 1) srcIdx = ops.map((_, k) => k).filter(k => k !== 0);
      for (const k of srcIdx) {
        if (new RegExp(`\\bR${r}\\b`).test(ops[k])) return true;
      }
      // 目的寄存器同时是源: Thumb 2 操作数形式 LSL/LSR/ASR/ROR (Rd=Rd op Rm)
      // 以及 MUL (MULS Rd,Rm => Rd=Rd*Rm) 隐式读取目的寄存器. 不处理会导致
      // 死 MOV 消除 / 拷贝传播误判.
      const destAsSrcOps = ['LSL', 'LSR', 'ASR', 'ROR', 'MUL'];
      if (destAsSrcOps.includes(op) && ops.length >= 1 && new RegExp(`\\bR${r}\\b`).test(ops[0])) return true;
      // Thumb 二操作数 ALU 形式 OP Rd, <#imm|Rm> 语义为 Rd = Rd op src, 目的寄存器被隐式读取.
      // 立即数形式如 SUB R0,#1 => R0=R0-1; **寄存器形式同样如此**: AND R0,R3 => R0=R0&R3 (Thumb-1
      // AND/ORR/EOR/BIC/ADC/SBC 只有 2 操作数形式, Rd 恒为源). 曾因只识别 '#' 立即数形式,
      // 漏判 AND R0,R3 读 R0, 致 Pass 6 误删前导 MOV R0,R4 (test4.c spirw data&0x80 恒 0, 实机故障).
      const immDestSrcOps = ['ADD', 'SUB', 'ADC', 'SBC', 'AND', 'ORR', 'EOR', 'BIC'];
      if (immDestSrcOps.includes(op) && ops.length === 2 && new RegExp(`\\bR${r}\\b`).test(ops[0])) return true;
      return false;
    };

    while (changed) {
      changed = false;

      // ---- Pass 0: 删除 no-op 算术 (不影响标志, 无副作用) ----
      // ADD/SUB Rd,#0 以及 LSL/ASR/LSR Rd,Rd,#0 都是 Rd=Rd 的纯冗余指令.
      // 后端翻译 RI/移位指令在 rd!=rs 时先 MOV 再运算, 当 imm/shift==0 即产生此类废指令.
      for (let i = 0; i < lines.length; i++) {
        const s = lines[i] ? lines[i].trim() : '';
        if (!s || s.startsWith('.') || s.startsWith('@') || s.startsWith(';') || s.endsWith(':')) continue;
        const m = s.match(/^(ADD|SUB)\s+R(\d+),\s*#0$/i)
               || s.match(/^(LSL|ASR|LSR)\s+R(\d+),\s*R\2,\s*#0$/i);
        if (!m) continue;
        // 安全护栏: 紧跟的下一条非注释指令不是条件分支 (防极端依赖标志场景)
        let next = null;
        for (let k = i + 1; k < lines.length; k++) {
          const t = lines[k] ? lines[k].trim() : '';
          if (!t || t.startsWith('.') || t.startsWith('@') || t.startsWith(';')) continue;
          if (t.endsWith(':')) { next = null; break; }
          next = t; break;
        }
        if (next && /^(BEQ|BNE|BLT|BGT|BLE|BGE)\b/i.test(next)) continue;
        lines[i] = null; changed = true;
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 1: 消除 MOV R6,Rx / MOV Rx,R6 高寄存器临时对 ----
      // _lo(hiReg) → MOV R6, R{hiReg};  ...  ; _hi(hiReg) → MOV R{hiReg}, R6
      // 如果中间没有写入 R6, 则可以消除这对 MOV, 并将中间指令的 R6 替换为 R{hiReg}
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i] ? lines[i].trim().match(/^MOV\s+R6,\s*R(\d+)$/i) : null;
        if (!m) continue;
        const hiReg = parseInt(m[1]);
        if (hiReg < 8 || hiReg > 12) continue;

        const targetPat = new RegExp(`^MOV\\s+R${hiReg},\\s*R6$`, 'i');
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j] ? lines[j].trim() : '';
          if (t.endsWith(':')) break;  // 标签 = 跳转目标, 不安全
          if (!t || t.startsWith('.') || t.startsWith('@') || t.startsWith(';')) continue;
          if (targetPat.test(t)) {
            // 扫描 i+1..j-1 是否有写入 R6 的指令
            let writesR6 = false;
            for (let k = i + 1; k < j; k++) {
              if (lines[k] && _instWritesReg(lines[k], 6)) { writesR6 = true; break; }
            }
            if (!writesR6) {
              // 高寄存器 R8-R12 不可 PUSH/POP: 若中间指令在 PUSH/POP 中引用了 R6,
              // 替换 R6->hiReg 会生成非法 PUSH {Rhi}/POP {Rhi} 指令; 且消除配对会撤掉
              // `MOV R6, R{hi}` 对 R6 的初始化, 使 `PUSH {R6}` 推入错误值. 故高寄存器
              // 情形禁止消除该对 (低寄存器情形替换合法, 不受影响).
              let pushPopR6 = false;
              if (hiReg > 7) {
                for (let k = i + 1; k < j; k++) {
                  if (!lines[k]) continue;
                  const _o = lines[k].trim().split(/\s+/)[0].toUpperCase();
                  if ((_o === 'PUSH' || _o === 'POP') && /\bR6\b/.test(lines[k])) { pushPopR6 = true; break; }
                }
              }
              if (!pushPopR6) {
                lines[i] = null; lines[j] = null;
                changed = true;
                // 将中间指令中的 R6 源操作数替换为 R{hiReg}
                for (let k = i + 1; k < j; k++) {
                  if (lines[k]) lines[k] = lines[k].replace(/\bR6\b/g, `R${hiReg}`);
                }
              }
            }
            break;
          }
        }
        if (changed) break; // 重新扫描
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 1.5: x &= ~c 用 BIC 取代 "MOV #c ; MVN Rn,Rn ; AND[S] Rm,Rn" ----
      // Thumb-1 的 BIC 是寄存器形式: BIC Rd, Rm = Rd & ~Rm (即 Rd = Rd AND (NOT Rm)).
      // 对 "MOV Rn,#c ; MVN Rn,Rn ; AND[S] Rm,Rn" (Rm != Rn, 且三条之间无改写 Rn 的真实指令)
      // 重写为 "MOV Rn,#c ; BIC[S] Rm,Rn": 省掉一条 MVN, 语义完全等价 (Rm = Rm & ~c).
      // ANDS/BICS 均按结果置 N/Z, MVN 中间置位被后续 BIC 覆盖, 故标志位等价.
      // 标志位: ANDS/BICS 均按结果置 N/Z; MVN 的中间置位被后续 AND/BIC 覆盖, 故等价.
      // 仅作用于低寄存器 (高寄存器经 R6 中转, 形式不同, 不在此处理).
      const _nextRealIdx = (from) => {
        for (let k = from; k < lines.length; k++) {
          const t = lines[k] ? lines[k].trim() : '';
          if (!t) continue;
          if (t.startsWith('.') || t.startsWith('@') || t.startsWith(';')) continue;
          return k;
        }
        return -1;
      };
      for (let i = 0; i < lines.length; i++) {
        const a = lines[i] ? lines[i].trim() : '';
        const ma = a.match(/^MOV\s+R(\d+),\s*#(-?\d+)$/i);
        if (!ma) continue;
        const n = parseInt(ma[1]);
        if (n < 0 || n > 7) continue;
        const j = _nextRealIdx(i + 1);
        if (j < 0) break;
        if (!new RegExp(`^MVN\\s+R${n},\\s*R${n}$`, 'i').test(lines[j].trim())) continue;
        const k = _nextRealIdx(j + 1);
        if (k < 0) break;
        const mc = lines[k].trim().match(new RegExp(`^ANDS?\\s+R(\\d+),\\s*R${n}$`, 'i'));
        if (!mc) continue;
        const m = parseInt(mc[1]);
        if (m === n) continue;        // AND Rn,Rn 为恒等, 但 BIC Rn,Rn=0, 语义不同, 跳过
        // 三条之间不得有改写 Rn 的真实指令 (理论只有注释/空行)
        let clobbered = false;
        for (let x = i + 1; x < j; x++) if (lines[x] && _instWritesReg(lines[x], n)) { clobbered = true; break; }
        if (!clobbered) for (let x = j + 1; x < k; x++) if (lines[x] && _instWritesReg(lines[x], n)) { clobbered = true; break; }
        if (clobbered) continue;
        lines[j] = null;                       // 删除 MVN
        const _s = /^ANDS\b/i.test(lines[k].trim()) ? 'S' : '';
        lines[k] = `BIC${_s} R${m}, R${n}`;     // AND/ANDS -> BIC/BICS (标志位等价)
        changed = true;
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 1.6: LDR Rx, =C ; MOV Ry, Rx  ->  LDR Ry, =C ----
      // 常量先装入某寄存器再立即搬移到另一寄存器 (典型: MMIO 地址常量经 R0 中转再 MOV 到
      // 基址寄存器 R2, 白白占用 R0 并逼出后续 PUSH {R0}/POP {R0} 保活). 当 Rx 仅为这次
      // 搬运服务(MOV 之后不再被读取)时, 直接把常量装入目标寄存器 Ry 并删除中转 MOV.
      // 安全: Rx/Ry 均须为低寄存器 (可作 LDR 字面量目标); MOV 为 LDR 之后下一条真实指令;
      // Rx 在 MOV 之后、被改写或遇屏障前不被读取 (否则 Rx 仍被后续使用, 不可删其装载).
      for (let i = 0; i < lines.length; i++) {
        const a = lines[i] ? lines[i].trim() : '';
        const ma = a.match(/^LDR\s+R(\d+),\s*=(0x[0-9a-fA-F]+)$/i);
        if (!ma) continue;
        const sx = parseInt(ma[1]);
        if (sx < 0 || sx > 7) continue;                 // 仅低寄存器可作 LDR =lit 目标
        const j = _nextRealIdx(i + 1);
        if (j < 0) break;
        const mb = lines[j].trim().match(/^MOV\s+R(\d+),\s*R(\d+)$/i);
        if (!mb) continue;
        const dy = parseInt(mb[1]), fx = parseInt(mb[2]);
        if (dy === sx || fx !== sx) continue;           // 必须是 Rx 搬到 Ry
        if (dy < 0 || dy > 7) continue;                 // Ry 也须可作 LDR =lit 目标
        let rxDead = true;
        for (let k = j + 1; k < lines.length; k++) {
          const lk = lines[k] ? lines[k].trim() : '';
          if (!lk) continue;
          if (lk.startsWith('.') || lk.startsWith('@') || lk.startsWith(';')) continue;
          if (lk.endsWith(':')) { rxDead = false; break; }
          if (/^(B|BEQ|BNE|BLT|BGT|BLE|BGE|BL|BLX|SWI)\b/i.test(lk)) { rxDead = false; break; }
          if (_instReadsReg(lines[k], sx)) { rxDead = false; break; }   // Rx 仍被使用
          if (_instWritesReg(lines[k], sx)) break;                       // Rx 被改写 -> 旧值此后为死
        }
        if (!rxDead) continue;
        lines[i] = `LDR R${dy}, =${ma[2]}`;
        lines[j] = null;
        changed = true;
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 1.7: PUSH {Rs}; ...; POP {Rd}  (为腾出 Rs 装常量而用栈保活) -> MOV Rd, Rs ----
      // 典型: 寄存器 Rs 持有一个值(如刚读出的 *pa), 但后续需把常量装入 Rs(如 MOV Rs,#imm),
      // 故 PUSH {Rs} 把值暂存栈, 待 Rs 被常量占用后再 POP {Rd} 还原到 Rd. 当段内 Rs 不被读取、
      // Rd 不被读写、且无屏障/其它栈操作/经栈读取时, 可用 MOV Rd, Rs 在段首把值搬入 Rd, 删除
      // PUSH/POP 整对, 省掉栈往返 (直接命中 MMIO 的 *pa |= c / *pa &= ~c 写法).
      // 安全: Rs/Rd ∈ R0-R3 且 Rs != Rd; 段内无分支/调用/标签/其它 PUSH/POP/经栈读取;
      // Rs 在段内不被作为源读取(其值由 MOV Rd,Rs 在段首捕获); Rd 在段内既不被读也不被写
      // (保证段末 Rd 仍持有捕获到的值, 与原 POP {Rd} 还原等价).
      for (let i = 0; i < lines.length; i++) {
        const pm = lines[i] ? lines[i].trim().match(/^PUSH\s+\{(R[0-3])\}$/) : null;
        if (!pm) continue;
        const rsName = pm[1], rsNum = parseInt(rsName.slice(1));
        // PUSH {Rs} 的配对 POP 按栈深度(而非同寄存器名)定位: 段内禁止其它 PUSH/POP,
        // 故下一个 PUSH/POP 指令即其配对 POP (可能弹入不同寄存器 Rd, 即栈式 R0->R1 搬家).
        // 初始深度 1 = 行 i 的 PUSH {Rs} 本身.
        let depth = 1, j = -1;
        for (let m = i + 1; m < lines.length; m++) {
          const lm = lines[m] ? lines[m].trim() : '';
          if (/^PUSH\b/i.test(lm)) depth++;
          else if (/^POP\b/i.test(lm)) { depth--; if (depth === 0) { j = m; break; } }
        }
        if (j <= i) continue;
        const popM = lines[j].trim().match(/^POP\s+\{(R[0-3])\}$/);
        if (!popM) continue;
        const rdNum = parseInt(popM[1].slice(1));
        if (rdNum === rsNum) continue;
        let ok = true;
        for (let k = i + 1; k < j; k++) {
          const lk = lines[k] ? lines[k].trim() : '';
          if (!lk) continue;
          if (/^(B|BEQ|BNE|BLT|BGT|BLE|BGE|BL|BLX|SWI)\b/i.test(lk) || lk.endsWith(':')) { ok = false; break; }
          if (/^PUSH\b/i.test(lk) || /^POP\b/i.test(lk)) { ok = false; break; }
          if (/\[SP/i.test(lk)) { ok = false; break; }
          if (_instReadsReg(lines[k], rsNum)) { ok = false; break; }
          if (_instWritesReg(lines[k], rdNum) || _instReadsReg(lines[k], rdNum)) { ok = false; break; }
        }
        if (!ok) continue;
        lines[i] = `MOV R${rdNum}, R${rsNum}`;
        lines[j] = null;
        changed = true;
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 1.8: 消除"保存-重定义-恢复"型 PUSH {Rs}/POP {Rd} (同/异寄存器) ----
      // 典型: PUSH {R1}; MOVS R1,#imm; BICS R0,R1; POP {R1} —— Rs 仅作即时数掩码中转,
      //   其旧值(如循环计数)在 POP 之后从未被消费, 整对栈往返纯属冗余; 又如
      //   PUSH {R0}; MOV R0,#c; EOR R0,R3; POP {R1}; AND R0,R1 —— 段首把旧 R0 捕获到 R1
      //   即可免栈. 直接命中用户所给 spi/MMIO 写法中"为装常量腾寄存器而 PUSH 保活"的反模式.
      // 安全护栏(段内): 无分支/调用/标签/其它 PUSH/POP/[SP] 读取; Rs 在段内首次出现必须是
      //   写(重定义), 保证旧值未在段内被消费; 异寄存器时 Rd 在段内不被触碰(段首 MOV Rd,Rs
      //   捕获旧值后即独占). 同寄存器时额外要求旧值在 POP 之后为死(精确向后边活性, 见下).
      {
        const _brRe8 = /^(B|BEQ|BNE|BLT|BGT|BLE|BGE|BX|BL|BLX|SWI)\b/i;
        const _callRe8 = /^(BL|BLX)\b/i;
        const _labelPos8 = new Map();
        for (let li = 0; li < lines.length; li++) {
          const lt = lines[li] ? lines[li].trim() : '';
          if (lt.endsWith(':')) _labelPos8.set(lt.slice(0, -1), li);
        }
        const _matchPop8 = (start) => {
          let depth = 1;
          for (let m = start + 1; m < lines.length; m++) {
            const lm = lines[m] ? lines[m].trim() : '';
            if (/^PUSH\b/i.test(lm)) depth++;
            else if (/^POP\b/i.test(lm)) { depth--; if (depth === 0) return m; }
          }
          return -1;
        };
        // 精确"POP 后旧值死"判定: 向前扫描; 调用/函数入口 -> 死; 写 Rs -> 死; 读 Rs -> 活.
        // 向后分支(B/Bcc 到文本前方): 仅当回边区间 [tpos, k] 内不读取 Rs(忽略分支自身)才视为
        //   安全(继续向前); 若回边读 Rs 或含未配平的 PUSH {Rs} -> 保守判活. 向前分支透明(线性
        //   扫描会覆盖其落点). 比 Pass 2 的 _afterDead 更精确: 不再因任意回边无脑阻断.
        const _deadAfterPrecise = (start, rNum) => {
          for (let k = start; k < lines.length; k++) {
            const lk = lines[k] ? lines[k].trim() : '';
            if (!lk) continue;
            if (lk.endsWith(':') && this._funcEntryLabels && this._funcEntryLabels.has(lk.slice(0, -1))) return true;
            if (_callRe8.test(lk)) return false;
            const bm = lk.match(/^(B|BEQ|BNE|BLT|BGT|BLE|BGE)\s+(\S+)/i);
            if (bm) {
              const tpos = _labelPos8.get(bm[2]);
              if (tpos !== undefined && tpos <= k) {
                let reads = false;
                for (let m = tpos; m <= k; m++) {
                  const lm = lines[m] ? lines[m].trim() : '';
                  if (!lm) continue;
                  if (new RegExp(`^PUSH\\s+\\{R${rNum}\\}$`, 'i').test(lm)) {
                    const pj = _matchPop8(m); if (pj < 0) { reads = true; break; } m = pj; continue;
                  }
                  if (_instReadsReg(lines[m], rNum)) { reads = true; break; }
                }
                if (reads) return false;
                continue;
              }
              continue;
            }
            if (_instWritesReg(lines[k], rNum)) return true;
            if (_instReadsReg(lines[k], rNum)) return false;
          }
          return true;
        };
        for (let i = 0; i < lines.length; i++) {
          const pm = lines[i] ? lines[i].trim().match(/^PUSH\s+\{(R[0-3])\}$/) : null;
          if (!pm) continue;
          const rsNum = parseInt(pm[1].slice(1));
          const j = _matchPop8(i);
          if (j <= i) continue;
          const popM = lines[j].trim().match(/^POP\s+\{(R[0-3])\}$/);
          if (!popM) continue;
          const rdNum = parseInt(popM[1].slice(1));
          let ok = true, rsFirst = 0; // 0 未访问, 1 首次为写(重定义), 2 首次为读
          for (let k = i + 1; k < j; k++) {
            const lk = lines[k] ? lines[k].trim() : '';
            if (!lk) continue;
            if (_brRe8.test(lk) || lk.endsWith(':')) { ok = false; break; }
            if (_callRe8.test(lk)) { ok = false; break; }
            if (/^PUSH\b/i.test(lk) || /^POP\b/i.test(lk)) { ok = false; break; }
            if (/\[SP/i.test(lk)) { ok = false; break; }
            if (rsFirst === 0) {
              if (_instWritesReg(lines[k], rsNum)) rsFirst = 1;
              else if (_instReadsReg(lines[k], rsNum)) rsFirst = 2;
            }
            if (rdNum !== rsNum && (_instWritesReg(lines[k], rdNum) || _instReadsReg(lines[k], rdNum))) { ok = false; break; }
          }
          if (!ok || rsFirst !== 1) continue;
          if (rdNum === rsNum) {
            if (!_deadAfterPrecise(j + 1, rsNum)) continue;
            lines[i] = null; lines[j] = null; changed = true;
          } else {
            lines[i] = `MOV R${rdNum}, R${rsNum}`;
            lines[j] = null; changed = true;
          }
        }
        if (changed) { lines = lines.filter(l => l !== null); continue; }
      }

      // ---- Pass 2: liveness-aware 删除冗余 PUSH {Rx}/POP {Rx} 对 ----
      // 仅针对后端临时低寄存器 Rx ∈ {R1,R2,R3} 的单寄存器 PUSH/POP.
      // (排除 prologue 的 callee/LR 保存如 PUSH {R4,LR}, 以及 callee-saved R6 的中转保护.)
      // ORI/ANDI/XORI 等用 PUSH {R3} 保护调用者的 R3(临时), 但 R3 在 TAC 层是死临时值,
      // 该保存/恢复纯属 codegen 冗余. 安全删除条件(保持栈平衡, 两条同删):
      //   (a) 段内保存值已死: 在 (i+1..j-1) 中 Rx 先被写(覆盖)而非被读, 且无分支/调用/标签/嵌套同名 PUSH;
      //   (b) 段后恢复值已死: 在 POP 之后, Rx 在被写/调用/函数末之前不被作为数据源读取.
      //       链式 PUSH/POP(如连续的 *pa|=c / *pa&=~c)整体判定: 递归验证每对均可删才删.
      // 配对采用 LIFO 深度匹配(而非"首个 PUSH 配首个 POP"), 以正确处理同一寄存器保存的
      // 嵌套/交错(如 hi 寄存器 ORI 将 PUSH {R3}/POP {R3} 包在 PUSH {R6}/POP {R6} 内), 杜绝
      // 误删导致的栈失衡. 标签(含函数入口)作为屏障, 配对不会跨函数, 不会破坏栈平衡.
      const _brRe = /^(B|BEQ|BNE|BLT|BGT|BLE|BGE|BX|BL|BLX|SWI)\b/i;
      const _callRe = /^(BL|BLX)\b/i;
      // 标签 → 行号 映射 (供 _afterDead 判定向后分支/回边)
      const _labelPos = new Map();
      for (let li = 0; li < lines.length; li++) {
        const lt = lines[li] ? lines[li].trim() : '';
        if (lt.endsWith(':')) _labelPos.set(lt.slice(0, -1), li);
      }
      for (let i = 0; i < lines.length; i++) {
        const pm = lines[i] ? lines[i].trim().match(/^PUSH\s+\{(R[0-3])\}$/) : null;
        if (!pm) continue;
        const rName = pm[1];
        const rNum = parseInt(rName.slice(1));
        // LIFO 深度匹配: 从 start 处的 PUSH {Rx} 起, 累计 PUSH/POP {Rx} 深度, 回到 0 即配对 POP
        const _matchPop = (start) => {
          let depth = 0;
          for (let m = start; m < lines.length; m++) {
            const lm = lines[m] ? lines[m].trim() : '';
            if (lm === `PUSH {${rName}}`) depth++;
            else if (lm === `POP {${rName}}`) { depth--; if (depth === 0) return m; }
          }
          return -1;
        };
        // 段内安全: 保存值先被写(覆盖)而非被读, 无分支/调用/标签/嵌套同名 PUSH
        const _pairInSpanOK = (i2, j2) => {
          let nested = false, bad = false, firstAcc = 0;
          for (let k = i2 + 1; k < j2; k++) {
            const lk = lines[k] ? lines[k].trim() : '';
            if (!lk) continue;
            if (_brRe.test(lk) || lk.endsWith(':')) { bad = true; break; }
            if (new RegExp(`^PUSH\\s+\\{${rName}\\}$`).test(lk)) { nested = true; break; }
            if (firstAcc === 0) {
              if (_instWritesReg(lines[k], rNum)) firstAcc = 1;
              else if (_instReadsReg(lines[k], rNum)) firstAcc = 2;
            }
          }
          return !bad && !nested && firstAcc !== 2;
        };
        // 段后恢复值是否死: 直到被写/调用/函数末之前不被数据读取; 链式 PUSH 递归验证.
        // 普通分支(B/Bcc/BX)与标签视为透明: 分支不消耗 R3, 其后继代码在线性文本中位于其后,
        // 继续扫描即可覆盖其对 R3 的读取; 但**向后分支(回边)例外**: 其目标在文本前方, 线性扫描
        // 永远覆盖不到目标处对 Rx 的读取 (如 preheader 物化的循环常量 R3=1 在循环头被 ADD 读取,
        // 而 POP {R3} 在循环体内 —— 误删导致 MOV R3,#128 永久踩掉增量, i+=128 只循环一次,
        // test4.c spirw 实机故障). 故遇向后分支必须保守阻断. 唯独调用(BL/BLX)另须阻断: R3 可能作实参.
        const _afterDead = (start) => {
          for (let k = start; k < lines.length; k++) {
            const lk = lines[k] ? lines[k].trim() : '';
            if (!lk) continue;
            // 函数入口: 调用约定下 R1/R2/R3 为 caller-clobbered, 进入新函数即视为死值,
            // 安全停止 (避免线性扫描越过函数边界误判"被后续函数读取 -> 不可删").
            if (lk.endsWith(':') && this._funcEntryLabels && this._funcEntryLabels.has(lk.slice(0, -1))) return true;
            if (_callRe.test(lk)) return false;            // 调用: R3 可能作实参/被调用方破坏
            // 向后分支 (B/Bcc 到文本前方标签): 目标处可能读取 Rx, 线性扫描无法覆盖 -> 保守阻断
            const bm = lk.match(/^(B|BEQ|BNE|BLT|BGT|BLE|BGE)\s+(\S+)/i);
            if (bm) {
              const tpos = _labelPos.get(bm[2]);
              if (tpos !== undefined && tpos <= k) return false;
            }
            if (new RegExp(`^PUSH\\s+\\{${rName}\\}$`).test(lk)) {
              const pj = _matchPop(k);
              if (pj < 0) return false;
              if (!_pairInSpanOK(k, pj) || !_afterDead(pj + 1)) return false;
              k = pj; continue;
            }
            if (_instWritesReg(lines[k], rNum)) return true;    // 被覆盖 -> 恢复值死
            if (_instReadsReg(lines[k], rNum)) return false;    // 被数据读取 -> 不可删
          }
          return true;                                         // 抵达函数末仍未用 -> 死
        };
        // 段内 Rx 完全未被触碰(既未读也未写, 且无屏障/其它栈操作/经栈读取) =>
        // PUSH/POP 仅是"保活冗余": 删掉后 Rx 仍原样持有该值, 栈亦平衡. 此情形与
        // 段后是否使用 Rx 无关, 恒可删 (直接命中 LDR Rx,=C; MOV Ry,Rx 修正后的
        // "PUSH {Rx} ... POP {Rx}" 栈中转, 如用户所给 main 内 MMIO 写法).
        const _spanPreserved = (i2, j2) => {
          for (let k = i2 + 1; k < j2; k++) {
            const lk = lines[k] ? lines[k].trim() : '';
            if (!lk) continue;
            if (_brRe.test(lk) || lk.endsWith(':')) return false;            // 屏障
            if (/^PUSH\b/i.test(lk) || /^POP\b/i.test(lk)) return false;      // 其它栈操作
            if (/\[SP/i.test(lk)) return false;                              // 经栈读取可能依赖被推值
            if (_instWritesReg(lines[k], rNum) || _instReadsReg(lines[k], rNum)) return false;
          }
          return true;
        };
        const _pairDead = (i2, j2) => _spanPreserved(i2, j2) || (_pairInSpanOK(i2, j2) && _afterDead(j2 + 1));
        const j = _matchPop(i);
        if (j <= i) continue;
        if (_pairDead(i, j)) { lines[i] = null; lines[j] = null; changed = true; }
        if (changed) break;
      }

      // ---- Pass 3: 合并连续 NOP ----
      let nopCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] && lines[i].trim() === 'NOP') { nopCount++; continue; }
        if (nopCount > 1) {
          for (let k = i - nopCount; k < i - 1; k++) lines[k] = null;
          changed = true;
        }
        nopCount = 0;
      }
      if (nopCount > 1) {
        for (let k = lines.length - nopCount; k < lines.length - 1; k++) lines[k] = null;
        changed = true;
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 3: 消除 MOV Rd,Rd (自MOV → NOP) ----
      for (let i = 0; i < lines.length; i++) {
        const m2 = lines[i] ? lines[i].trim().match(/^MOV\s+R(\d+),\s*R\1$/i) : null;
        if (m2) { lines[i] = 'NOP'; changed = true; break; }
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 4: 常量加载去重 (LDR =C / MOV Rk,#imm) ----
      // 同一基本块内, 若某寄存器已持有常量 C, 则后续对 C 的加载可:
      //   * 同寄存器冗余加载 -> 删除 (省 2B 指令 + 4B 字面池)
      //   * 不同寄存器加载 -> 替换为 MOV Rj,RS (省 2B 指令 + 4B 字面池)
      // 标签/分支/PUSH/POP 视为屏障, 清空常量跟踪以保证正确.
      {
        const regConst = new Map(); // regNum -> 常量值(int)
        const clearAll = () => regConst.clear();
        for (let i = 0; i < lines.length; i++) {
          const raw = lines[i] ? lines[i].trim() : '';
          if (!raw) continue;
          if (raw.endsWith(':')) { clearAll(); continue; }
          if (raw.startsWith('.') || raw.startsWith('@') || raw.startsWith(';')) continue;
          if (/^(B|BL|BEQ|BNE|BLT|BGT|BLE|BGE|BLX|SWI)\b/i.test(raw)) { clearAll(); continue; }
          if (/^PUSH\b/i.test(raw) || /^POP\b/i.test(raw)) { clearAll(); continue; }

          // 解析常量加载: LDR Rj, =0x...  或  MOV Rj, #imm8
          let jReg = -1, cVal = null;
          let m = raw.match(/^LDR\s+R(\d+),\s*=(0x[0-9a-fA-F]+)$/i);
          if (m) { jReg = parseInt(m[1]); cVal = parseInt(m[2], 16); }
          else {
            m = raw.match(/^MOV\s+R(\d+),\s*#(\d+)$/i);
            if (m) { const imm = parseInt(m[2]); if (imm >= 0 && imm <= 255) { jReg = parseInt(m[1]); cVal = imm; } }
          }

          if (jReg >= 0 && cVal !== null) {
            // 同寄存器冗余加载 -> 删除
            if (regConst.get(jReg) === cVal) { lines[i] = null; changed = true; continue; }
            // 他寄存器已持有同常量 -> 替换为 MOV (省 LDR + 字面池)
            let srcReg = -1;
            for (const [r, v] of regConst) { if (r !== jReg && v === cVal) { srcReg = r; break; } }
            if (srcReg >= 0) {
              lines[i] = `MOV R${jReg}, R${srcReg}`;
              regConst.set(jReg, cVal);
              changed = true;
              continue;
            }
            // 普通加载: 记录该寄存器当前持有 C (覆盖任何旧值)
            regConst.set(jReg, cVal);
          } else {
            // 非加载指令: 失效其写入的寄存器
            for (let r = 0; r <= 12; r++) {
              if (_instWritesReg(lines[i], r)) regConst.delete(r);
            }
          }
        }
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 5: 局部拷贝传播 (消除冗余 MOV reg-reg) ----
      // 前向扫描基本块: 记录 MOV Rd,Rs 的等价关系, 把后续指令中 Rd 的源使用替换为 Rs.
      // 标签/分支/PUSH/POP 视为屏障清空 avail (保守). STR/PUSH/CMP 等全部操作数为源, POP 全为目标(不替换).
      {
        const avail = new Map();
        const splitOps = (s) => {
          const out = []; let d = 0, cur = '';
          for (const ch of s) { if (ch === '[') d++; else if (ch === ']') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; }
          if (cur.trim()) out.push(cur.trim());
          return out;
        };
        // Thumb-1 限制: 高寄存器 R8-R12 只能出现在少数 2 操作数 Hi 形式
        // (MOV/ADD/SUB/CMP Rd,Rm 与 BX) 中, 不能出现在 3 操作数 ALU 的任意操作数、
        // STR/LDR 的基址/索引、或 PUSH/POP 寄存器表中. 因此拷贝传播**绝不**把某寄存器
        // 替换成高寄存器 (否则如 ADD R0,R1,R0 -> ADD R0,R1,R8 生成 Thumb-1 无编码的
        // 非法指令, 汇编器/VM 误解造成运算结果偏差). 仅低->低 (R0-R7) 传播安全.
        const subst = (tok) => tok.replace(/\bR(\d+)\b/g, (mm, n) => {
          if (!avail.has(parseInt(n))) return mm;
          const rt = avail.get(parseInt(n));
          if (rt > 7) return mm;
          return 'R' + rt;
        });
        for (let i = 0; i < lines.length; i++) {
          const raw = lines[i] ? lines[i].trim() : '';
          if (!raw) continue;
          if (raw.endsWith(':')) { avail.clear(); continue; }
          if (raw.startsWith('.') || raw.startsWith('@') || raw.startsWith(';')) continue;
          if (/^(B|BL|BEQ|BNE|BLT|BGT|BLE|BGE|BLX|SWI)\b/i.test(raw)) { avail.clear(); continue; }
          const sc = raw.split(';')[0].trim();
          const pm = sc.match(/^([A-Z][A-Z0-9]*)\b\s*(.*)$/i);
          if (!pm) continue;
          const op = pm[1].toUpperCase();
          const ops = splitOps(pm[2].trim());
          // 目的操作数判定
          let isDest = true;
          if (op === 'STR' || op === 'STRB' || op === 'STRH' || op === 'PUSH' || op === 'CMP' || op === 'CMN' || op === 'TST' || op === 'BX' || op === 'BL' || op === 'BLX') isDest = false;
          if (op === 'POP') isDest = true; // 纯目的, 不进行源替换
          const srcIdx = [];
          for (let k = 0; k < ops.length; k++) {
            if (op === 'POP') break;            // POP 操作数全是目的, 不替换
            if (!isDest) srcIdx.push(k);
            else if (k !== 0) srcIdx.push(k);
          }
          // 计算本指令写入的寄存器集合 (供替换安全护栏)
          const writtenRegs = new Set();
          for (let r = 0; r <= 12; r++) if (_instWritesReg(raw, r)) writtenRegs.add(r);
          let changedLine = false;
          const useSubst = subst; // subst 已内置"不替换为高寄存器"护栏, 对所有指令通用
          for (const k of srcIdx) {
            const orig = ops[k];
            // 安全护栏: 若某源寄存器 s 被替换为 avail[s]=Rt, 而本指令会写入 Rt,
            //           则替换不安全 (Rt 会被本指令自身改写, 破坏"Rt 持有原 s 的值").
            // 典型: MOV R3,R1; LSL R1,R3 -> 若把 R3 替换成 R1 得 LSL R1,R1 即错误.
            let safe = true;
            const regsInOp = (orig.match(/\bR(\d+)\b/g) || []).map(x => parseInt(x.slice(1)));
            for (const s of regsInOp) {
              if (avail.has(s)) { const Rt = avail.get(s); if (writtenRegs.has(Rt)) { safe = false; break; } }
            }
            if (safe) { const nt = useSubst(orig); if (nt !== orig) { ops[k] = nt; changedLine = true; } }
          }
          if (changedLine) { lines[i] = op + (ops.length ? ' ' + ops.join(', ') : ''); changed = true; }
          // 计算被写入的寄存器, 失效所有 key===w 或 value===w 的等价项
          // (源寄存器被改写时, 所有指向它的等价项都必须失效, 否则会传播到陈旧值)
          const written = [];
          if (op === 'POP') { for (const o of ops) { const m = o.match(/R(\d+)/i); if (m) written.push(parseInt(m[1])); } }
          else if (isDest && ops[0]) { const m = ops[0].match(/R(\d+)/i); if (m) written.push(parseInt(m[1])); }
          for (const w of written) {
            for (const k of [...avail.keys()]) { if (k === w || avail.get(k) === w) avail.delete(k); }
          }
          // 记录 MOV Rd,Rs 等价 (仅当 Rd 与 Rs 为不同寄存器)
          if (op === 'MOV' && ops.length >= 2) {
            const dm = ops[0].match(/^R(\d+)$/i), sm = ops[1].match(/^R(\d+)$/i);
            if (dm && sm && parseInt(dm[1]) !== parseInt(sm[1])) avail.set(parseInt(dm[1]), parseInt(sm[1]));
          }
        }
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }

      // ---- Pass 6: 死 MOV 消除 (前向扫描, Rd 在被重定义前不再被读则删除) ----
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] ? lines[i].trim() : '';
        if (!raw || raw.startsWith('.') || raw.startsWith('@') || raw.startsWith(';') || raw.endsWith(':')) continue;
        const sc = raw.split(';')[0].trim();
        const pm = sc.match(/^MOV\s+R(\d+),\s*R(\d+)$/i);
        if (!pm) continue;
        const rd = parseInt(pm[1]);
        if (rd === parseInt(pm[2])) continue;
        let dead = true;
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j] ? lines[j].trim() : '';
          if (!t) continue;
          if (t.startsWith('.') || t.startsWith('@') || t.startsWith(';')) continue;
          if (t.endsWith(':')) { dead = false; break; }
          if (/^(B|BL|BEQ|BNE|BLT|BGT|BLE|BGE|BLX|BX|SWI)\b/i.test(t)) { dead = false; break; }
          // PUSH/POP 对 rd 的活性并非一律不透明:
          //   POP {..Rd..} 是对 Rd 的"纯定义"(只写不读) → 此前写入 Rd 的 MOV 必死;
          //   PUSH {..Rd..} 读 Rd → 活;
          //   不含 Rd 的 PUSH/POP 只动 SP, 对 Rd 活性透明, 可继续向后扫描.
          // (历史实现把三者统统当屏障, 致 "PUSH {R0}; MOV R0,Rx; ...; POP {R0}" 这类
          //  地址计算中转里的死 MOV 永远删不掉 —— 正是 *p=... 写回序列的主要冗余来源.)
          const pp = t.match(/^(PUSH|POP)\s*\{([^}]*)\}/i);
          if (pp) {
            const body = pp[2].toUpperCase();
            if (body.includes('-') || body.includes('PC') || body.includes('LR')) { dead = false; break; } // 寄存器范围 / 函数出口: 保守
            const regs = body.split(',').map(s => s.trim());
            if (regs.includes('R' + rd)) { dead = (pp[1].toUpperCase() === 'POP'); break; }
            continue;
          }
          if (_instWritesReg(t, rd)) { dead = !_instReadsReg(t, rd); break; }
          if (_instReadsReg(t, rd)) { dead = false; break; }
        }
        if (dead) { lines[i] = null; changed = true; }
      }
      if (changed) { lines = lines.filter(l => l !== null); continue; }
    }

    return lines;
  }

  // ================================================================
  // run — 直接执行 Thumb 代码 (非 genROM 路径)
  // ================================================================
  run(addr, argv, c, opts) {
    opts = opts || {};
    if (!argv) argv = [];
    const code = this.code.slice();
    if (!code || code.length === 0) throw Error('No TAC code');
    const dataBase = 0;
    const codeBaseAddr = (((c.datapos + 3) >> 2) << 2);
    const RAM_BASE = opts.ramBase !== undefined ? opts.ramBase : 0x20000000;
    const RAM_SIZE = opts.ramSize !== undefined ? opts.ramSize : 0x2000;
    const STACK_SIZE = opts.stackSize !== undefined ? opts.stackSize : 0x400;
    const ROM_BASE = opts.romBase !== undefined ? opts.romBase : 0xC0;
    // ---- 强制含 DIV/MOD 的函数为非叶函数 ----
    (function forceNonLeafForDiv(code) {
      const divOps = new Set([opcode.DIV, opcode.MOD, opcode.DIVI, opcode.MODI]);
      let currentHasDiv = false;
      for (let wi = 0; wi < code.length; ) {
        const op = code[wi];
        if (op === opcode.ENTER) {
          currentHasDiv = false;
          for (let wi2 = wi + _tacOpSize(op); wi2 < code.length; ) {
            const op2 = code[wi2];
            if (op2 === opcode.ENTER || op2 === opcode.LEAVE) break;
            if (divOps.has(op2)) { currentHasDiv = true; break; }
            wi2 += _tacOpSize(op2);
          }
          if (currentHasDiv) code[wi + 1] &= ~0x10000;
        } else if (op === opcode.LEAVE && currentHasDiv) {
          code[wi + 1] &= ~0x100;
          currentHasDiv = false;
        }
        wi += _tacOpSize(op);
      }
    })(code);

    // Pass 0: 修补 TAC MOVI 中的 c.data 地址
    for (let wi = 0; wi < code.length; ) {
      const op0 = code[wi];
      if (op0 === opcode.MOVI) {
        const val = code[wi + 2];
        if (val >= 0 && val < c.datapos) code[wi + 2] = dataBase + val;
      }
      wi += _tacOpSize(op0);
    }

    // 预解析函数指针 fixup
    for (const fx of this.funcAddrFixups) {
      if (fx._targetSegIdx !== undefined) continue;
      const sym = c.sysboltable && c.sysboltable[fx.symIdx];
      if (sym && sym.Class === tokens.Fun && sym.FuncId >= 0) fx._targetSegIdx = sym.FuncId;
      else fx._targetSegIdx = -1;
    }

    let { lines, entryLabel, needsDiv, tacAsmRanges } = this._translateTACtoASM(code, addr, dataBase, c.datapos, false);
    if (needsDiv) this._emitDivSubroutines(l => lines.push(l));
    if (this.optLevel !== 0 && !this.noAsmPeep) lines = this._peephole(lines);
    // peephole: Pass1 高寄存器消除, Pass2 NOP压缩, Pass3 自MOV消除

    const exitLabel = 'L_exit';
    lines.push(`${exitLabel}: SWI 0xFF`);
    lines.push(`B ${exitLabel} ; infinite loop fallback`);
    lines.push(`.ltorg`);

    if (!this.asm) this.asm = new ThumbM0();
    const asmSource = lines.join('\n');
    let bytes;
    try { bytes = this.asm.parseASM(asmSource, codeBaseAddr); }
    catch (e) { console.error('Assembly error:', e.message); throw e; }

    const codeEnd = codeBaseAddr + bytes.length;
    const memSize = Math.max(0x10000, codeEnd + 0x8000, ROM_BASE + 0x8000, RAM_BASE + RAM_SIZE + 0x8000);
    const cpu = new ThumbCPU(memSize);
    this._cpu = cpu;

    for (let i = 0; i < c.datapos; i++) cpu.memory.buffer[i] = c.data[i];
    for (let i = 0; i < bytes.length; i++) cpu.memory.buffer[codeBaseAddr + i] = bytes[i];

    let exitAddr = codeBaseAddr + bytes.length - 6;
    for (let i = bytes.length - 4; i >= 0; i -= 2) {
      if ((bytes[i] | (bytes[i + 1] << 8)) === 0xDFFF) { exitAddr = codeBaseAddr + i; break; }
    }
    const stackTop = RAM_BASE + RAM_SIZE;
    cpu.setReg(13, stackTop - STACK_SIZE);
    cpu.setReg(14, (exitAddr) | 1);

    // 找到 main 函数的入口
    // 优先用 addrmap[entryLabel] 精确定位 (entryLabel 在 _translateTACtoASM 中于 main 的
    // TAC 地址处发射, 与是否帧消除/是否 PUSH R5 无关). addrmap 存相对偏移, 需加 codeBaseAddr.
    // 旧式 R5 探测仅作兜底.
    let entryPC = codeBaseAddr;
    if (this.asm && this.asm.addrmap && this.asm.addrmap[String(entryLabel).toLowerCase()] !== undefined) {
      entryPC = codeBaseAddr + this.asm.addrmap[String(entryLabel).toLowerCase()];
    } else {
      let foundExtFn = 0;
      for (let wi = 0; wi < code.length; ) {
        const ta = wi * 4;
        if (ta >= addr) break;
        const op = code[wi];
        if (op === opcode.ENTER) foundExtFn++;
        wi += _tacOpSize(op);
      }
      const wantedIdx = foundExtFn;
      let found = -1;
      for (let off = 0; off + 1 < bytes.length; off += 2) {
        const hw = (bytes[off] | (bytes[off+1] << 8));
        const isPush = ((hw >> 8) === 0xB5 || (hw >> 8) === 0xB4);
        const hasR5 = (hw & 0x20) !== 0;
        if (isPush && hasR5) {
          found++;
          if (found === wantedIdx) { entryPC = codeBaseAddr + off; break; }
        }
      }
    }
    cpu.setReg(15, entryPC);
    cpu.setReg(0, argv.length);
    const argvBase = codeEnd + 16;
    for (let i = 0; i < argv.length; i++) {
      const strBase = argvBase + 64 + i * 64;
      const enc = new TextEncoder().encode(argv[i] + '\0');
      for (let j = 0; j < enc.length; j++) cpu.memory.buffer[strBase + j] = enc[j];
      cpu.memory.writeInt(argvBase + i * 4, strBase);
    }
    cpu.setReg(1, argvBase);

    // SWI 中断处理
    cpu.interrupt = soffset => {
      if (soffset === 0xFF) { c._exitFlag = true; return; }
      if (c.sysFuncs && c.sysFuncs[soffset]) {
        const thumbSP = cpu.getReg(13);
        const ac = cpu.getReg(1);
        const maxArgs = 8;
        const ARGOFF = 256;
        // TAC PUSH 顺序: R0(先), R1(后) → SP+0=R1, SP+4=R0
        for (let ai = 0; ai < ac; ai++)
          c.Intdata[ARGOFF + ai] = cpu.memory.readInt(thumbSP + (ac - 1 - ai) * 4);
        const rv = c.sysFuncs[soffset](c, ARGOFF * 4, ac);
        cpu.setReg(0, rv || 0);
      }
    };

    try { cpu.run(10000000); }
    catch (e) {
      if (!e.message || !e.message.includes('POP {PC}')) {
        console.error(`ERR: ${e.message} at PC=${cpu.getReg(15)}`);
      }
    }
    c.output = c.output || '';
    c._exitFlag = true;
  }

  // ---- 中断向量项的机器码生成 ----
  // 统一走汇编器: 生成一行汇编文本 → ThumbM0.parseASM() 转成 opcode 字节, 不手写位域编码.
  // 用独立的 ThumbM0 实例, 避免污染 this.asm 的 addrmap / 行地址表.
  _vecAsm(text) {
    if (!this._vecAsmEngine) this._vecAsmEngine = new ThumbM0();
    return this._vecAsmEngine.parseASM(text);
  }
  // `B .` 自跳无限循环 (2 字节 = 0xE7FE). 汇编器约定: B 操作数 = 目标地址 - 本指令地址
  _vecBSelf() { return this._vecAsm('B 0'); }
  // `BL 目标函数` (4 字节). 汇编器约定: BL 操作数 = 目标地址 - (本指令地址 + 2)
  _vecBL(slotAddr, faddr) { return this._vecAsm('BL ' + (faddr - slotAddr - 2)); }

  // ================================================================
  // genROM — 生成 ROM.bin (含启动代码)
  // ================================================================
  genROM(addr, argv, filename, c, opts) {
    opts = opts || {};
    const RAM_BASE = opts.ramBase !== undefined ? opts.ramBase : 0x20000000;
    const RAM_SIZE = opts.ramSize !== undefined ? opts.ramSize : 0x2000;
    const STACK_SIZE = opts.stackSize !== undefined ? opts.stackSize : 0x400;
    const CODE_START = opts.romBase !== undefined ? opts.romBase : 0xC0;
    const STACK_TOP = RAM_BASE + RAM_SIZE;
    const DATAPOS = c.datapos;
    const dataBase = RAM_BASE;
    // 向量表大小: 至少含 SP/Reset/NMI/HardFault 共 4 项 (16B, 与 Keil 一致);
    // 若源码使用了 __interrupt_N (N>3), 则扩展到 N+1 项以容纳该中断向量的 BL 回填.
    const _iv = this._interruptSlots || {};
    let _maxVec = 3;
    for (const _k of Object.keys(_iv)) { const _i = parseInt(_k, 10); if (_i > _maxVec) _maxVec = _i; }
    const VEC_SIZE = (_maxVec + 1) * 4;
    const DATA_ROM = CODE_START + VEC_SIZE;

    const code = this.code.slice();
    if (!code || code.length === 0) throw Error('No TAC code');

    // ---- 强制含 DIV/MOD 的函数为非叶函数 ----
    // DIV/MOD 内部调用 __sdiv32 (通过 BL), 会覆盖 LR
    // 如果函数是叶函数 (使用 BX LR 返回), LR 丢失导致返回地址错误
    (function forceNonLeafForDiv(code) {
      const divOps = new Set([opcode.DIV, opcode.MOD, opcode.DIVI, opcode.MODI]);
      let currentHasDiv = false;
      for (let wi = 0; wi < code.length; ) {
        const op = code[wi];
        if (op === opcode.ENTER) {
          currentHasDiv = false;
          for (let wi2 = wi + _tacOpSize(op); wi2 < code.length; ) {
            const op2 = code[wi2];
            if (op2 === opcode.ENTER || op2 === opcode.LEAVE) break;
            if (divOps.has(op2)) { currentHasDiv = true; break; }
            wi2 += _tacOpSize(op2);
          }
          if (currentHasDiv) code[wi + 1] &= ~0x10000; // clear isLeaf
        } else if (op === opcode.LEAVE && currentHasDiv) {
          code[wi + 1] &= ~0x100; // clear isLeaf
          currentHasDiv = false;
        }
        wi += _tacOpSize(op);
      }
    })(code);

    // ---- 构建初始化记录 ----
    c.buildInitRecords();
    const initRecs = c.initRecords;

    // ---- Pass 0a: 修补 data 池中的指针值 ----
    for (const r of initRecs) {
      if (r.type === 'const') continue;
      for (let bi = 0; bi < r.size; bi += 4) {
        const a = r.offset + bi;
        const v = c.Intdata[a >> 2];
        if (v >= 0 && v < DATAPOS) c.Intdata[a >> 2] = dataBase + v;
      }
    }

    // ---- Pass 0: 修补 TAC LDA 地址 ----
    for (let wi = 0; wi < code.length; ) {
      const op0 = code[wi];
      if (op0 === opcode.LDA) {
        const val = code[wi + 2];
        if (val >= 0 && val < DATAPOS) code[wi + 2] = dataBase + val;
      }
      wi += _tacOpSize(op0);
    }

    // 预解析函数指针 fixup
    for (const fx of this.funcAddrFixups) {
      if (fx._targetSegIdx !== undefined) continue;
      const sym = c.sysboltable && c.sysboltable[fx.symIdx];
      if (sym && sym.Class === tokens.Fun && sym.FuncId >= 0) fx._targetSegIdx = sym.FuncId;
      else fx._targetSegIdx = -1;
    }

    // ---- 直通翻译: TAC → Thumb ASM (无任何优化) ----
    let { lines, entryLabel, needsDiv } = this._translateTACtoASM(code, addr, dataBase, DATAPOS, true);
    if (this.optLevel !== 0 && !this.noAsmPeep) lines = this._peephole(lines);

    // ---- 启动代码 ----
    const totalDataWords = ((Math.max(
      initRecs.reduce((s,r) => r.type !== 'bss' ? Math.max(s, r.offset+r.size) : s, 0), DATAPOS) + 3) & ~3) >> 2;
    const startupLines = ['_startup:'];
    let recLabel = 0;
    let maxInitEnd = 0;

    for (const r of initRecs) {
      if (r.type === 'bss') {
        let hasPatchedData = false;
        for (let bi = 0; bi < r.size; bi += 4) {
          if (c.Intdata[(r.offset + bi) >> 2] >= RAM_BASE) { hasPatchedData = true; break; }
        }
        if (!hasPatchedData) {
          const rDst = RAM_BASE + r.offset;
          const words = (r.size + 3) >> 2;
          startupLines.push(
            `LDR R1, =0x${(rDst >>> 0).toString(16)}`, `MOV R2, #${words}`,
            `B _ibss_chk${recLabel}`, `_ibss_loop${recLabel}:`,
            `MOV R3, #0`, `STR R3, [R1, #0]`, `ADD R1, R1, #4`, `SUB R2, R2, #1`,
            `_ibss_chk${recLabel}:`, `CMP R2, #0`, `BNE _ibss_loop${recLabel}`);
          recLabel++;
          continue;
        }
      }
      const rSrc = DATA_ROM + r.offset;
      const rDst = RAM_BASE + r.offset;
      const words = (r.size + 3) >> 2;
      if (r.offset + r.size > maxInitEnd) maxInitEnd = r.offset + r.size;
      startupLines.push(
        `LDR R0, =0x${(rSrc >>> 0).toString(16)}`, `LDR R1, =0x${(rDst >>> 0).toString(16)}`,
        `MOV R2, #${words}`, `B _icopy_chk${recLabel}`,
        `_icopy_loop${recLabel}:`, `LDR R3, [R0, #0]`, `STR R3, [R1, #0]`,
        `ADD R0, R0, #4`, `ADD R1, R1, #4`, `SUB R2, R2, #1`,
        `_icopy_chk${recLabel}:`, `CMP R2, #0`, `BNE _icopy_loop${recLabel}`);
      recLabel++;
    }
    // 补拷贝剩余数据
    const totalDataBytes = totalDataWords * 4;
    const dataEnd = ((maxInitEnd + 3) >> 2) << 2;
    if (dataEnd < totalDataBytes) {
      const remainWords = ((totalDataBytes - dataEnd) + 3) >> 2;
      startupLines.push(
        `LDR R0, =0x${((DATA_ROM + dataEnd) >>> 0).toString(16)}`,
        `LDR R1, =0x${((RAM_BASE + dataEnd) >>> 0).toString(16)}`,
        `MOV R2, #${remainWords}`, `B _icopy_chk${recLabel}`,
        `_icopy_loop${recLabel}:`, `LDR R3, [R0, #0]`, `STR R3, [R1, #0]`,
        `ADD R0, R0, #4`, `ADD R1, R1, #4`, `SUB R2, R2, #1`,
        `_icopy_chk${recLabel}:`, `CMP R2, #0`, `BNE _icopy_loop${recLabel}`);
      recLabel++;
    }

    startupLines.push(
      'BL ' + entryLabel,
      '_exit:', 'SWI 0xFF', 'B _exit', '.ltorg');

    // ---- 合并 ASM ----
    const sdivArray = needsDiv ? [
      '__sdiv32:', 'PUSH {LR}', 'CMP R1, #0', 'BEQ __div0', 'MOV R2, R0', 'MOV R4, #0',
      'CMP R2, #0', 'BGE __sdiv32_chkdiv', 'MVN R2, R2', 'ADD R2, R2, #1', 'MOV R4, #1',
      '__sdiv32_chkdiv:', 'CMP R1, #0', 'BGE __sdiv32_call', 'MVN R1, R1', 'ADD R1, R1, #1',
      'MVN R4, R4', 'ADD R4, R4, #1', '__sdiv32_call:', 'PUSH {R4}', 'MOV R0, R2', 'BL __udiv32',
      'POP {R4}', 'CMP R4, #0', 'BEQ __sdiv32_done', 'MVN R0, R0', 'ADD R0, R0, #1',
      '__sdiv32_done:', 'POP {PC}',
      '__udiv32:', 'PUSH {LR}', 'CMP R1, #0', 'BEQ __div0', 'MOV R2, R1', 'MOV R3, R0',
      'MOV R0, #0', 'MOV R4, #0', '__udiv32_align:', 'CMP R2, R3', 'BGE __udiv32_loop_setup',
      'ADD R4, R4, #1', 'LSL R2, R2, #1', 'B __udiv32_align',
      '__udiv32_loop_setup:', 'ADD R4, R4, #1',
      '__udiv32_loop:', 'LSL R0, R0, #1', 'CMP R2, R3', 'BGT __udiv32_skip', 'ADD R0, R0, #1',
      'SUB R3, R3, R2', '__udiv32_skip:', 'LSR R2, R2, #1', 'SUB R4, R4, #1', 'BNE __udiv32_loop',
      'POP {PC}', '__div0:', 'MOV R0, #0', 'POP {PC}',
    ] : [];
    const allLines = startupLines.concat([''], lines, [''], sdivArray);
    const fullAsm = allLines.join('\n');

    // ---- 汇编 ----
    if (!this.asm) this.asm = new ThumbM0();
    let bytes;
    try {
      const startupBase = CODE_START + VEC_SIZE +
        (Math.max(initRecs.reduce((s,r) => r.type !== 'bss' ? Math.max(s, r.offset+r.size) : s, 0), DATAPOS) + 3) & ~3;
      bytes = this.asm.parseASM(fullAsm, startupBase);
    } catch (e) { console.error('Assembly error:', e.message); throw e; }

    // ---- 组装 ROM.bin (使用 Uint8Array, 浏览器/Node 通用, 无需 Buffer) ----
    const alignedDataSize = (Math.max(
      initRecs.reduce((s,r) => r.type !== 'bss' ? Math.max(s, r.offset+r.size) : s, 0), DATAPOS) + 3) & ~3;
    const startupBase = CODE_START + VEC_SIZE + alignedDataSize;
    const dataPool = new Uint8Array(alignedDataSize);
    for (const r of initRecs) {
      for (let bi = 0; bi < r.size; bi++) dataPool[r.offset + bi] = c.data[r.offset + bi];
    }
    for (let i = 0; i < DATAPOS; i++) { if (dataPool[i] === 0) dataPool[i] = c.data[i]; }

    // 函数名 → 最终绝对地址 (供向量表/基准/调试工具定位入口), 须先于向量表构建
    this._funcAddrMap = {};
    if (this._funcNameLabels && this.asm && this.asm.addrmap) {
      for (const [fn, lbl] of Object.entries(this._funcNameLabels)) {
        const off = this.asm.addrmap[String(lbl).toLowerCase()];
        if (off !== undefined) this._funcAddrMap[fn] = startupBase + off;
      }
    }
    // ---- 中断向量表构建 ----
    // 布局: [0]=SP 字面量, [1]=Reset 入口地址, [2..N]=可执行代码槽 (每槽 4 字节)
    // 步骤 1: 索引 2 起的所有槽先用 `B .` (0xE7FE, 自跳无限循环) 填满 —— 未定义的中断
    //         进来只会原地卡住, 不会跑飞到随机代码.
    // 步骤 2: 对收集到的 __interrupt_N 函数, 把 `BL 目标函数` 编成 4 字节 opcode 回填到第 N 槽.
    const vecEntries = _maxVec + 1;
    const vecBuf = new Uint8Array(vecEntries * 4);
    vecBuf[0] = STACK_TOP & 0xFF; vecBuf[1] = (STACK_TOP>>8)&0xFF;
    vecBuf[2] = (STACK_TOP>>16)&0xFF; vecBuf[3] = (STACK_TOP>>24)&0xFF;
    const _reset = startupBase | 1;
    vecBuf[4] = _reset & 0xFF; vecBuf[5] = (_reset>>8)&0xFF;
    vecBuf[6] = (_reset>>16)&0xFF; vecBuf[7] = (_reset>>24)&0xFF;
    const bSelf = this._vecBSelf();              // 汇编 `B .` -> 2 字节 opcode (0xE7FE)
    for (let i = 2; i < vecEntries; i++) {
      vecBuf[i*4    ] = bSelf[0]; vecBuf[i*4 + 1] = bSelf[1];
      vecBuf[i*4 + 2] = bSelf[0]; vecBuf[i*4 + 3] = bSelf[1];
    }
    // 步骤 2: BL 回填 (__interrupt_N 标记的函数, 含用户自定义的 NMI/HardFault)
    const _fmap = this._funcAddrMap || {};
    const _vecFilled = [];
    for (const [k, fname] of Object.entries(_iv)) {
      const idx = parseInt(k, 10);
      if (idx < 2 || idx >= vecEntries) continue;  // 0=SP, 1=Reset 为特殊项, 不回填 BL
      const faddr = _fmap[fname];
      if (faddr === undefined) continue;           // 函数被优化掉/未生成: 保留 B . 兜底
      const slotAddr = CODE_START + idx * 4;
      const bl = this._vecBL(slotAddr, faddr >>> 0);   // 汇编 `BL fn` -> 4 字节 opcode
      for (let b = 0; b < 4; b++) vecBuf[idx*4 + b] = bl[b];
      _vecFilled.push(idx + ':' + fname);
    }

    this._lastCodeBytes = bytes;
    this._lastBodyLines = lines;          // 代码体 ASM 行 (不含启动/除法)
    this._lastStartupLines = startupLines; // 启动代码 ASM 行
    this._lastFullCodeBase = startupBase;  // 完整代码在 ROM 中的基址

    // 拼接 ROM 镜像: [向量表][数据池][代码]
    const rom = new Uint8Array(vecBuf.length + dataPool.length + bytes.length);
    rom.set(vecBuf, 0);
    rom.set(dataPool, vecBuf.length);
    rom.set(bytes, vecBuf.length + dataPool.length);
    this._lastROM = rom; // 供浏览器端下载

    // Node 环境: 若给定文件名则写出文件
    if (_c4ThumbIsNode && filename) {
      const nodeBuf = Buffer.from(rom);
      require('fs').writeFileSync(filename, nodeBuf);
      console.log('ROM.bin:', filename);
    }

    // ---- 生成摘要 (供 IDE 输出栏/命令行展示) ----
    const totalInitBss = initRecs.filter(r=>r.type!=='const').reduce((s,r)=>s+r.size,0);
    const constSize = initRecs.filter(r=>r.type==='const').reduce((s,r)=>s+r.size,0);
    const binName = (opts && opts.fileName) ? opts.fileName : (filename || '');
    const hasName = binName.length > 0;
    const optTag = 'O' + (this.optLevel || 0);
    let summary = hasName ? (binName + ':\n') : '';
    summary +=
      '  Vec: ' + vecEntries + ' entries (' + (vecEntries*4) + 'B)' +
        (_vecFilled.length ? ' BL-> ' + _vecFilled.join(', ') : '') + '\n' +
      '  Code: ' + bytes.length + ' B @ 0x' + startupBase.toString(16) + '\n' +
      '  Data: ' + alignedDataSize + ' B (const: ' + constSize + ' B, init+bss: ' + totalInitBss + ' B) @ 0x' + CODE_START.toString(16) + '\n' +
      '  Total: ' + rom.length + ' B\n' +
      '  SP init: 0x' + STACK_TOP.toString(16) + '\n' +
      optTag + ' | Code: ' + bytes.length + 'B | ROM: ' + rom.length + 'B' +
        (hasName ? ' | ' + binName : '');
    this._lastSummary = summary;
    console.log(summary);

    return rom;
  }

  // ---- 除法子程序 ----
  _emitDivSubroutines(push) {
    push('__sdiv32:'); push('PUSH {LR}'); push('CMP R1, #0'); push('BEQ __div0');
    push('MOV R2, R0'); push('MOV R4, #0');
    push('CMP R2, #0'); push('BGE __sdiv32_chkdiv'); push('MVN R2, R2'); push('ADD R2, R2, #1'); push('MOV R4, #1');
    push('__sdiv32_chkdiv:'); push('CMP R1, #0'); push('BGE __sdiv32_call'); push('MVN R1, R1');
    push('ADD R1, R1, #1'); push('MVN R4, R4'); push('ADD R4, R4, #1');
    push('__sdiv32_call:'); push('PUSH {R4}'); push('MOV R0, R2'); push('BL __udiv32');
    push('POP {R4}'); push('CMP R4, #0'); push('BEQ __sdiv32_done');
    push('MVN R0, R0'); push('ADD R0, R0, #1');
    push('__sdiv32_done:'); push('POP {PC}');
    push('__udiv32:'); push('PUSH {LR}'); push('CMP R1, #0'); push('BEQ __div0');
    push('MOV R2, R1'); push('MOV R3, R0'); push('MOV R0, #0'); push('MOV R4, #0');
    push('__udiv32_align:'); push('CMP R2, R3'); push('BGE __udiv32_loop_setup');
    push('ADD R4, R4, #1'); push('LSL R2, R2, #1'); push('B __udiv32_align');
    push('__udiv32_loop_setup:'); push('ADD R4, R4, #1');
    push('__udiv32_loop:'); push('LSL R0, R0, #1'); push('CMP R2, R3');
    push('BGT __udiv32_skip'); push('ADD R0, R0, #1'); push('SUB R3, R3, R2');
    push('__udiv32_skip:'); push('LSR R2, R2, #1'); push('SUB R4, R4, #1'); push('BNE __udiv32_loop');
    push('POP {PC}'); push('__div0:'); push('MOV R0, #0'); push('POP {PC}');
  }
}

// UMD 导出：Node 用 module.exports，浏览器挂到 window.C4Thumb
if (_c4ThumbIsNode) {
  module.exports = { ThumbBackend, _tacOpSize };
} else if (typeof window !== 'undefined') {
  window.C4Thumb = { ThumbBackend, _tacOpSize };
} else if (typeof define === 'function' && define.amd) {
  define(() => ({ ThumbBackend, _tacOpSize }));
}
})();