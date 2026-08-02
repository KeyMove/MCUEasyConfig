'use strict';
(function(){'use strict';
// UMD 兼容：Node 下用 require, 浏览器下用全局 (由 <script> 注入 window)
const _c4RegIsNode = (typeof module !== 'undefined' && module.exports);
let fs = null;
if (_c4RegIsNode) { try { fs = require('fs'); } catch (e) { fs = null; } }
// TextEncoder 浏览器原生支持; Node 下回退 util
function newte(){
  if (typeof TextEncoder !== 'undefined') return new TextEncoder();
  return new (require('util').TextEncoder)();
}


const tokens = {
  Num:128,Fun:129,Sys:130,Glo:131,Loc:132,Id:133,
  Char:134,Else:135,Enum:136,For:137,If:138,Int:139,
  Return:140,Sizeof:141,While:142,
  Short:166,Switch:167,Case:168,Default:169,Do:170,Goto:171,Continue:172,Break:173,
  AddAssign:174,SubAssign:175,MulAssign:176,DivAssign:177,ModAssign:178,
  ShlAssign:179,ShrAssign:180,AndAssign:181,OrAssign:182,XorAssign:183,
  Assign:143,Cond:144,Lor:145,Lan:146,Or:147,Xor:148,
  And:149,Eq:150,Ne:151,Lt:152,Gt:153,Le:154,Ge:155,
  Shl:156,Shr:157,Add:158,Sub:159,Mul:160,Div:161,
  Mod:162,Inc:163,Dec:164,Brak:165,
  Dot:184,Arrow:185,Struct:186,Union:187,Const:188,Unsigned:189,Volatile:190,Weak:191,
  // 中断向量标记 __interrupt_0 ~ __interrupt_40:
  // 41 个名字共用这 1 条 token, 具体序号存放在符号表项的 Val 字段 (不新增 41 条 token)
  Interrupt:192
};

// 支持的中断向量最大序号 (__interrupt_0 ~ __interrupt_MAX_IRQ)
const MAX_IRQ = 40;

const opcode = {
  ADD:0,SUB:1,MUL:2,DIV:3,MOD:4,
  OR:5,XOR:6,AND:7,SHL:8,SHR:9,BIC:32,
  EQ:10,NE:11,LT:12,GT:13,LE:14,GE:15,
  ADDI:16,SUBI:17,MULI:18,DIVI:19,MODI:20,
  ORI:21,XORI:22,ANDI:23,SHLI:24,SHRI:25,
  EQI:26,NEI:27,LTI:28,GTI:29,LEI:30,GEI:31,
  LOAD:50,LOADB:51,STORE:52,STOREB:53,LEA:54,
  LOADH:68,STOREH:69,
  LOAD_OFF:48,STORE_OFF:49,
  LOADB_OFF:71,LOADH_OFF:72,STOREB_OFF:73,STOREH_OFF:74,
  MOVI:55,MOV:56,LDA:70,
  PUSH:57,POP:58,
  JMP:59,JZ:60,JNZ:61,CALL:62,RET:63,ENTER:64,LEAVE:65,ADJ:66,
  // 比较指令 (设置虚拟标志)
  CMP:40, CMPI:41,
  // 条件跳转 (读虚拟标志)
  JEQ:42, JNE:43, JLT:44, JGT:45, JLE:46, JGE:47,
  SYS_CALL:80,VM_EXIT:89,
  NOP:67,
  SYS_MCPY:81,
  CALLR:90, // call through register (function pointer)
  VB:95,    // volatile barrier — 单字优化屏障, 阻止 DCE/CSE/LICM 等跨越
};
const type = { CHAR:0, SHORT:1, INT:2, STRUCT:3, UNION:10, PTR:16 };
const POOL_BYTES = 4*1024*1024;

// TAC 染色常量 — 编码方案: 高4位=类型, 低4位=归属函数ID (funcId+1)
//   kind=0:     原始函数代码,  color = funcId+1  (0x01~0x0F)
//   kind=0x80:  CSE 临时值,    color = 0x80 | funcId+1
//   kind=0x90:  常量池复用,    color = 0x90 | funcId+1
//   kind=0xA0:  LICM 外提,     color = 0xA0 | funcId+1
//   kind=0xB0:  GRA 提升,      color = 0xB0 | funcId+1
//   kind=0xF0:  Volatile 屏障, color = 0xF0 (无归属)
const TAC_COLOR = {
  DEFAULT: 0,           // 未染色
  FUNC_BASE: 1,         // funcId+1 (低4位=函数索引, 高4位=0表示原始代码)
  // 优化器类型掩码 (需 | funcId+1 得到完整色)
  CSE_TEMP:   0x80,
  CONST_POOL: 0x90,
  LICM_HOIST: 0xA0,
  GRA_PROMOTE: 0xB0,
  VOLATILE: 0xF0,       // 全局屏障, 无归属
  // 辅助方法
  make: (base, funcId) => base | ((funcId + 1) & 0x0F),
  owner: c => c & 0x0F,  // 提取低4位=归属函数ID
  kind: c => c & 0xF0,   // 提取高4位=类型
};

// =====================================================================
// RegBackend — 寄存器式 VM 后端 (默认实现)
// =====================================================================
function instrLen(opc){
  if(opc>=0&&opc<=31)return 4;
  if(opc===32)return 4;  // BIC rd, rs, rt (寄存器形式, 同 AND: rd = rs & ~rt)
  if(opc===40)return 3;  // CMP rs, rt
  if(opc===41)return 3;  // CMPI rs, imm  [41,rd,imm]
  if(opc>=42&&opc<=47)return 2;  // Jcc target
  if(opc===48||opc===49)return 3;  // LOAD_OFF/STORE_OFF rd slot
  if(opc>=71&&opc<=74)return 3;  // LOADB_OFF/LOADH_OFF/STOREB_OFF/STOREH_OFF
  if(opc===50||opc===51||opc===52||opc===53||opc===54||opc===55||opc===56||opc===68||opc===69||opc===70)return 3;
  if(opc===57||opc===58)return 2;
  if(opc===59||opc===62)return 2; // JMP, CALL
  if(opc===60||opc===61)return 3;
  if(opc===63||opc===67||opc===89)return 1; // RET,NOP,VM_EXIT
  if(opc===65)return 2; // LEAVE: opcode + calleeMask
  if(opc===64||opc===66)return 2;
  if(opc===80)return 3;
  if(opc===90)return 2; // CALLR: opcode + rd
  if(opc===95)return 1; // VB: volatile barrier
  return 1;
}

// ============================================================
// AST 节点类型定义 (Phase 1 — 纯数据, 不依赖编译器)
// ============================================================

// ---- 表达式 ----

function IntLiteral(val) {
  return { kind: 'IntLiteral', val, type: null /* filled by parser */ };
}

function CharLiteral(val) {
  return { kind: 'CharLiteral', val };
}

function StringLiteral(addr) {
  return { kind: 'StringLiteral', addr };
}

function Identifier(name, symIdx) {
  return { kind: 'Identifier', name, symIdx };
}

function BinaryOp(left, opToken, right) {
  return { kind: 'BinaryOp', left, opToken, right };
}

function UnaryOp(opToken, operand) {
  return { kind: 'UnaryOp', opToken, operand };
}

function Assign(target, value, isCompound, compoundToken) {
  return { kind: 'Assign', target, value, isCompound: !!isCompound, compoundToken };
}

function FunctionCall(name, symIdx, args, calleeExpr) {
  return { kind: 'FunctionCall', name, symIdx, args, calleeExpr: calleeExpr || null };
}

function Dereference(ptr) {
  return { kind: 'Dereference', ptr };
}

function AddressOf(expr) {
  return { kind: 'AddressOf', expr };
}

function Subscript(base, index) {
  return { kind: 'Subscript', base, index };
}

function MemberAccess(obj, memberName, memberIdx) {
  return { kind: 'MemberAccess', obj, memberName, memberIdx, isArrow: false };
}

function PtrMemberAccess(obj, memberName, memberIdx) {
  return { kind: 'MemberAccess', obj, memberName, memberIdx, isArrow: true };
}

function Conditional(cond, thenExpr, elseExpr) {
  return { kind: 'Conditional', cond, thenExpr, elseExpr };
}

function LogicalAnd(left, right) {
  return { kind: 'LogicalAnd', left, right };
}

function LogicalOr(left, right) {
  return { kind: 'LogicalOr', left, right };
}

function SizeOfType(type) {
  return { kind: 'SizeOfType', type };
}

function SizeOfExpr(expr) {
  return { kind: 'SizeOfExpr', expr };
}

function CastExpr(targetType, expr) {
  return { kind: 'CastExpr', targetType, expr };
}

function PostfixOp(expr, opToken) {
  return { kind: 'PostfixOp', expr, opToken }; // ++ or --
}

function PrefixOp(expr, opToken) {
  return { kind: 'PrefixOp', expr, opToken }; // ++ or --
}

// ---- 语句 ----

function ExprStmt(expr) {
  return { kind: 'ExprStmt', expr };
}

function Block(stmts) {
  return { kind: 'Block', stmts: stmts || [] };
}

function IfStmt(cond, thenStmt, elseStmt) {
  return { kind: 'IfStmt', cond, thenStmt, elseStmt: elseStmt || null };
}

function ForStmt(init, cond, incr, body) {
  return { kind: 'ForStmt', init, cond, incr, body };
}

function WhileStmt(cond, body) {
  return { kind: 'WhileStmt', cond, body };
}

function DoWhileStmt(body, cond) {
  return { kind: 'DoWhileStmt', body, cond };
}

function SwitchStmt(expr, cases) {
  return { kind: 'SwitchStmt', expr, cases };
}

function CaseStmt(value, body) {
  return { kind: 'CaseStmt', value, body: body || [] };
}

function DefaultStmt(body) {
  return { kind: 'DefaultStmt', body: body || [] };
}

function GotoStmt(label) {
  return { kind: 'GotoStmt', label };
}

function LabelStmt(label, stmt) {
  return { kind: 'LabelStmt', label, stmt };
}

function BreakStmt() {
  return { kind: 'BreakStmt' };
}

function ContinueStmt() {
  return { kind: 'ContinueStmt' };
}

function ReturnStmt(expr) {
  return { kind: 'ReturnStmt', expr: expr || null };
}

// ---- 声明 ----

function VarDecl(name, symIdx, type, init, isConst, isArray, arrSize, isVolatile) {
  return {
    kind: 'VarDecl', name, symIdx, type,
    init: init || null,
    isConst: !!isConst,
    isArray: !!isArray,
    arrSize: arrSize || 0,
    isVolatile: !!isVolatile,
  };
}

function ParamDecl(name, symIdx, type) {
  return { kind: 'ParamDecl', name, symIdx, type };
}

function FunctionDecl(name, symIdx, params, body, returnType) {
  return {
    kind: 'FunctionDecl', name, symIdx,
    params: params || [],
    body: body || Block([]),
    returnType: returnType || null,
    locals: [], // filled by parser/analyzer
  };
}

// ---- 顶层 ----

function TranslationUnit(decls) {
  return { kind: 'TranslationUnit', decls: decls || [] };
}

// ---- 枚举声明 (用于 global consts) ----

function EnumDecl(name, symIdx, value) {
  return { kind: 'EnumDecl', name, symIdx, value };
}

function StructDef(name, symIdx, members, isUnion) {
  return { kind: 'StructDef', name, symIdx, members, isUnion };
}

function StructMember(name, symIdx, type, offset, size, count) {
  return { kind: 'StructMember', name, symIdx, type, offset, size, count };
}

// ---- 导出 ----
const AST = {
  // Expressions
  IntLiteral, CharLiteral, StringLiteral, Identifier,
  BinaryOp, UnaryOp, Assign, FunctionCall,
  Dereference, AddressOf, Subscript,
  MemberAccess, PtrMemberAccess,
  Conditional, LogicalAnd, LogicalOr,
  SizeOfType, SizeOfExpr, CastExpr,
  PostfixOp, PrefixOp,

  // Statements
  ExprStmt, Block, IfStmt, ForStmt, WhileStmt, DoWhileStmt,
  SwitchStmt, CaseStmt, DefaultStmt,
  GotoStmt, LabelStmt, BreakStmt, ContinueStmt, ReturnStmt,

  // Declarations
  VarDecl, ParamDecl, FunctionDecl,
  TranslationUnit, EnumDecl, StructDef, StructMember,
};

const O = opcode;
const tac = {
// ---------------------------------------------------------------------------
// 指令解码
// ---------------------------------------------------------------------------
decode(code){
  const ins=[]; let i=0;
  while(i<code.length){ const opc=code[i], len=instrLen(opc); ins.push({op:opc,i,len}); i+=len; }
  return ins;
},

// ---------------------------------------------------------------------------
// 寄存器 def / use (返回寄存器号数组, 仅 0..7)
// ---------------------------------------------------------------------------
defsOf(op,i,code){
  if(op>=0&&op<=31) return [code[i+1]];                       // ADD..GE / ADDI..GEI: rd
  if(op===32) return [code[i+1]];                             // BIC rd, rs, rt: rd
  if(op===O.MOV||op===O.MOVI||op===O.LDA||op===O.LEA) return [code[i+1]];
  if(op===O.POP) return [code[i+1]];
  if(op===O.LOAD||op===O.LOADB||op===O.LOADH||
     op===O.LOAD_OFF||op===O.LOADB_OFF||op===O.LOADH_OFF) return [code[i+1]];
  if(op===O.CALL||op===O.CALLR||op===O.SYS_CALL) return [0,1,2,3]; // 调用者保存寄存器被杀伤
  return [];
},
usesOf(op,i,code){
  if(op>=0&&op<=15) return [code[i+2],code[i+3]];             // ADD..GE rd,rs,rt
  if(op===32) return [code[i+2],code[i+3]];                   // BIC rd, rs, rt: rs, rt (非交换)
  if(op>=16&&op<=31) return [code[i+2]];                      // ADDI..GEI rd,rs,imm
  if(op===O.CMP) return [code[i+1],code[i+2]];
  if(op===O.CMPI) return [code[i+1]];
  if(op===O.MOV) return [code[i+2]];
  if(op===O.LOAD||op===O.LOADB||op===O.LOADH) return [code[i+2]];
  if(op===O.STORE_OFF||op===O.STOREB_OFF||op===O.STOREH_OFF) return [code[i+2]];
  if(op===O.STORE||op===O.STOREB||op===O.STOREH) return [code[i+1],code[i+2]];
  if(op===O.PUSH) return [code[i+1]];
  if(op===O.JZ||op===O.JNZ) return [code[i+1]];
  if(op===O.CALLR) return [code[i+1]];
  if(op===O.RET) return [0];
  return [];
},

// 是否终止指令 (块末改变控制流, 无段内后继)
isTerminator(op){
  return op===O.JMP || (op>=O.JEQ&&op<=O.JGE) || op===O.JZ || op===O.JNZ ||
         op===O.RET || op===O.LEAVE || op===O.VM_EXIT;
},
// 跳转目标字索引 (负 label id 经 labelTable 解析)
targetWordOf(op,i,code,labelTable){
  let tw = (op===O.JZ||op===O.JNZ) ? i+2 : i+1;
  const v = code[tw];
  if(v<0){ const lbl=-v; return labelTable && labelTable[lbl]!==undefined ? labelTable[lbl] : -1; }
  return v; // 已解析 (不应在 peephole 阶段出现)
},
// 该指令是否过程间优化屏障 (LICM/CSE 不可跨)
isBarrier(op){
  return op===O.CALL || op===O.CALLR || op===O.SYS_CALL ||
         op===O.RET || op===O.VM_EXIT || op===O.VB;
},

// ---------------------------------------------------------------------------
// CFG 构建
// ---------------------------------------------------------------------------
buildCFG(code, labelTable){
  const ins = this.decode(code);
  const n = code.length;
  const posOf = new Map(); // 字索引 -> 指令下标
  ins.forEach((x,idx)=>posOf.set(x.i,idx));

  // 基本块首 (leader) 字索引集合 (均为指令起点)
  const leaderWords = new Set([0]);
  if(labelTable) for(const k in labelTable) leaderWords.add(labelTable[k]);
  for(const x of ins){
    if(this.isTerminator(x.op)){
      const ft = x.i + x.len;            // fall-through (下一条指令起点)
      if(ft < n) leaderWords.add(ft);
      const tgt = this.targetWordOf(x.op,x.i,code,labelTable);
      if(tgt>=0 && tgt<n) leaderWords.add(tgt);
    }
  }
  // 仅保留真实指令起点 (label 可能指向函数尾部之外 / 非指令边界)
  const leaders = [...leaderWords].filter(w=>posOf.has(w)).sort((a,b)=>a-b);
  if(leaders.length===0) return { blocks:[], entry:0, blockOfWord:()=>-1, posOf, ins };

  // 字索引 -> 块 id (leaders 已排序, 二分找 <=w 的最大 leader)
  const blockOfWord = w => {
    if(w<0 || w>=n) return -1;
    let lo=0,hi=leaders.length-1,r=0;
    while(lo<=hi){ const m=(lo+hi)>>1; if(leaders[m]<=w){r=m;lo=m+1;}else hi=m-1; }
    return r; // leaders[r] 对应的块
  };

  // 以指令下标构造块: 块 k = 指令 [startIns .. endIns]
  const blocks=[]; // {id,startIns,endIns,succ:Set,pred:Set}
  for(let k=0;k<leaders.length;k++){
    const s=leaders[k];
    const startIns = posOf.get(s);
    const nextStartWord = (k+1<leaders.length) ? leaders[k+1] : (ins[ins.length-1].i + ins[ins.length-1].len);
    const endIns = ((k+1<leaders.length) ? posOf.get(nextStartWord) : ins.length) - 1;
    blocks.push({id:k,startIns,endIns,succ:new Set(),pred:new Set()});
  }

  // 后继 (依据块末指令)
  for(const b of blocks){
    const last = ins[b.endIns];
    if(this.isTerminator(last.op)){
      if(last.op===O.JMP){
        const t=this.targetWordOf(last.op,last.i,code,labelTable);
        if(t>=0){ const bid=blockOfWord(t); if(bid>=0) b.succ.add(bid); }
      } else if(last.op===O.RET||last.op===O.LEAVE||last.op===O.VM_EXIT){
        // 无后继 (函数返回 / 退出)
      } else { // 条件跳: 目标 + fall-through
        const t=this.targetWordOf(last.op,last.i,code,labelTable);
        if(t>=0){ const bid=blockOfWord(t); if(bid>=0) b.succ.add(bid); }
        const ft=b.endIns>=0 ? ins[b.endIns].i + ins[b.endIns].len : n;
        if(ft<n){ const bid=blockOfWord(ft); if(bid>=0) b.succ.add(bid); }
      }
    } else {
      // 顺序流入下一块 (指令连续, 下一块即 k+1)
      if(b.id+1<blocks.length) b.succ.add(b.id+1);
    }
  }
  // 补全 pred
  for(const b of blocks) for(const s of b.succ) blocks[s].pred.add(b.id);
  return { blocks, entry:0, blockOfWord, posOf, ins };
},

// ---------------------------------------------------------------------------
// 支配树 (Cooper-Harvey-Kennedy 迭代)
// ---------------------------------------------------------------------------
computeDominators(cfg){
  const { blocks, entry } = cfg;
  const order=[]; const vis=new Set();
  (function dfs(u){ if(vis.has(u))return; vis.add(u);
    for(const v of blocks[u].succ) dfs(v);
    order.push(u);
  })(entry);
  const rpo=order.reverse();
  const rpoNum=new Map(); rpo.forEach((b,idx)=>rpoNum.set(b,idx));
  const ids=blocks.map(b=>b.id);
  const dom=new Map();
  for(const b of ids) dom.set(b, new Set(ids));
  dom.set(entry, new Set([entry]));
  let changed=true, guard=0;
  while(changed && guard++<200){
    changed=false;
    for(const b of rpo){
      if(b===entry) continue;
      let nd=null;
      for(const p of blocks[b].pred){
        if(!dom.has(p)) continue;
        if(nd===null) nd=new Set(dom.get(p));
        else { const x=new Set(); for(const e of nd) if(dom.get(p).has(e)) x.add(e); nd=x; }
      }
      nd.add(b);
      const cur=dom.get(b);
      let same = nd.size===cur.size;
      if(same) for(const e of nd) if(!cur.has(e)){ same=false; break; }
      if(!same){ dom.set(b,nd); changed=true; }
    }
  }
  return {
    dom,
    dominates:(a,b)=> dom.has(b) && dom.get(b).has(a),
    idom:(b)=>{ // 最近支配者
      if(b===entry) return -1;
      const set=[...dom.get(b)].filter(x=>x!==b).sort((x,y)=>rpoNum.get(x)-rpoNum.get(y));
      return set.length?set[set.length-1]:-1;
    }
  };
},

// ---------------------------------------------------------------------------
// 自然循环检测 (回边: p->h 且 h 支配 p)
// ---------------------------------------------------------------------------
findNaturalLoops(cfg, domInfo){
  const { blocks } = cfg;
  const loops=[];
  const seenHeader=new Set();
  for(const b of blocks){
    for(const p of b.pred){
      // 回边 p -> b 当 b 支配 p
      if(domInfo.dominates(b.id, p)){
        const header=b.id;
        // 循环体 = {header} ∪ {可从 p 经 pred 到达, 且不经过 header 的节点}
        const body=new Set([header]);
        const stack=[p];
        while(stack.length){
          const x=stack.pop();
          if(x===header) continue;
          if(body.has(x)) continue;
          body.add(x);
          for(const pr of blocks[x].pred) stack.push(pr);
        }
        // 去重 (同 header 的多个回边合并)
        const exist=loops.find(l=>l.header===header);
        if(exist){ for(const x of body) exist.body.add(x); }
        else { loops.push({header, body}); seenHeader.add(header); }
      }
    }
  }
  return loops;
},

// ---------------------------------------------------------------------------
// 全局活性分析 (反向数据流, 块级 liveIn/liveOut)
// ---------------------------------------------------------------------------
computeLiveness(cfg, code){
  const { blocks } = cfg;
  const ins = this.decode(code);
  const liveInBlock=new Map(), liveOutBlock=new Map();
  for(const b of blocks){ liveInBlock.set(b.id,new Set()); liveOutBlock.set(b.id,new Set()); }
  let changed=true, guard=0;
  while(changed && guard++<400){
    changed=false;
    // 逆序块 id 即可收敛
    for(let bi=blocks.length-1; bi>=0; bi--){
      const b=blocks[bi];
      const out=new Set();

      for(const s of b.succ) for(const r of liveInBlock.get(s)) out.add(r);
      // 块内反向 (指令下标空间):
      let live=new Set(out);
      for(let idx=b.endIns; idx>=b.startIns; idx--){
        const x=ins[idx];
        const d=this.defsOf(x.op,x.i,code), u=this.usesOf(x.op,x.i,code);
        for(const r of d) live.delete(r);
        for(const r of u) live.add(r);
      }
      const cur=liveInBlock.get(b.id);
      let same=live.size===cur.size; if(same) for(const r of live) if(!cur.has(r)){same=false;break;}
      if(!same){ liveInBlock.set(b.id,new Set(live)); changed=true; }
      const ocur=liveOutBlock.get(b.id);
      let osame=out.size===ocur.size; if(osame) for(const r of out) if(!ocur.has(r)){osame=false;break;}
      if(!osame){ liveOutBlock.set(b.id,new Set(out)); changed=true; }
    }
  }
  return { liveInBlock, liveOutBlock };
},

// ---------------------------------------------------------------------------
// 统一分析入口
// ---------------------------------------------------------------------------
tacAnalyze(code, labelTable){
  const cfg = this.buildCFG(code, labelTable);
  const domInfo = this.computeDominators(cfg);
  const loops = this.findNaturalLoops(cfg, domInfo);
  const liveness = this.computeLiveness(cfg, code);
  return { cfg, domInfo, loops, liveness, defsOf:this.defsOf, usesOf:this.usesOf, isBarrier:this.isBarrier, isTerminator:this.isTerminator };
},
}




// c4_preproc.js — 独立预处理器 (M1+M2+M3+M4), 纯 class 形式, 无 fs/path 依赖
//
// 设计目标: 与编译器完全解耦。本模块把含 #define/#undef 的 C 源码
// "拍平"为纯 C 文本, 再整体交给现有 Comper。编译器 (nexttokens/parseStmt/...)
// 完全不感知宏的存在。
//
// 用法:
//   const pp = new Preprocessor({ 'xxx.h': '#define K 7\nint q = K;' });
//   pp.addInclude('yyy.c', '...');          // 后续设置
//   const out = pp.preprocessing('#include "xxx.h"\n');
//
// M1 能力范围:
//   - 微型 tokenizer: 把源码切成 token 流 (标识符/数字/字符串/字符/标点/空白/注释)
//   - #define 对象式宏 (无参):        #define NAME body
//   - #define 函数式宏 (带参):        #define NAME(a,b) body
//   - 实参捕获 (括号匹配/嵌套/逗号分割) + 形参代入 + 递归展开
//   - #undef
//   - 自引用防护 (激活宏名集合, 避免无限递归)
//   - 行注释 // 与块注释 /* */ 透传 (不参与宏展开, 但需正确切分以免误判)
//   - 字符串/字符字面量透传 (内部 token 不被展开)
//
// 不支持 (留待 M2/M3): # / ## 运算符, #ifdef/#if/#include。
//   (注: 本文件实际已支持 # ## 与条件编译, 仅注释沿用的旧描述)

// ---- token 类型 ----

// ---- 宏表 ----
// macro = { name, params: null | string[], body: token[] (不含前导/尾随空白) }
class Preprocessor {
  // token 类型 (作为静态成员, 避免模块级游离常量造成名称冲突)
  static T = { WS:0, ID:1, NUM:2, STR:3, CHR:4, PUNCT:5, COMMENT:6, NEWLINE:7, EOF:8 };

  // 切分一行源码为 token 序列 (含空白与注释, 保留以便重建文本)
  static tokenize(text) {
    const toks = [];
    let i = 0, n = text.length;
    while (i < n) {
      const c = text[i];
      // 空白 (不含换行, 换行单独处理)
      if (c === ' ' || c === '\t' || c === '\r') {
        let j = i + 1; while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r')) j++;
        toks.push({ t: Preprocessor.T.WS, v: text.slice(i, j) }); i = j; continue;
      }
      if (c === '\n') { toks.push({ t: Preprocessor.T.NEWLINE, v: '\n' }); i++; continue; }
      // 行注释
      if (c === '/' && text[i + 1] === '/') {
        let j = i + 2; while (j < n && text[j] !== '\n') j++;
        toks.push({ t: Preprocessor.T.COMMENT, v: text.slice(i, j) }); i = j; continue;
      }
      // 块注释
      if (c === '/' && text[i + 1] === '*') {
        let j = i + 2; while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++;
        j = Math.min(n, j + 2);
        toks.push({ t: Preprocessor.T.COMMENT, v: text.slice(i, j) }); i = j; continue;
      }
      // 字符串
      if (c === '"') {
        let j = i + 1;
        while (j < n) { if (text[j] === '\\') { j += 2; continue; } if (text[j] === '"') { j++; break; } j++; }
        toks.push({ t: Preprocessor.T.STR, v: text.slice(i, j) }); i = j; continue;
      }
      // 字符
      if (c === "'") {
        let j = i + 1;
        while (j < n) { if (text[j] === '\\') { j += 2; continue; } if (text[j] === "'") { j++; break; } j++; }
        toks.push({ t: Preprocessor.T.CHR, v: text.slice(i, j) }); i = j; continue;
      }
      // 数字
      if (c >= '0' && c <= '9') {
        let j = i + 1; while (j < n && /[0-9a-fA-FxX.]/.test(text[j])) j++;
        toks.push({ t: Preprocessor.T.NUM, v: text.slice(i, j) }); i = j; continue;
      }
      // 标识符
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
        toks.push({ t: Preprocessor.T.ID, v: text.slice(i, j) }); i = j; continue;
      }
      // 标点 (单字符; 但 ## 在宏里是记号粘贴运算符, 必须合并为单个 token)
      if (c === '#' && text[i + 1] === '#') { toks.push({ t: Preprocessor.T.PUNCT, v: '##' }); i += 2; continue; }
      toks.push({ t: Preprocessor.T.PUNCT, v: c }); i++;
    }
    toks.push({ t: Preprocessor.T.EOF, v: '' });
    return toks;
  }

  // 把 token 流重建成文本 (跳过 EOF)
  static detokenize(toks) {
    let s = '';
    for (const tk of toks) { if (tk.t === Preprocessor.T.EOF) break; s += tk.v; }
    return s;
  }


  // 跳过空白/注释, 返回第一个非空白 token 下标
  static skipSpace(toks, idx) {
    while (toks[idx] && (toks[idx].t === Preprocessor.T.WS || toks[idx].t === Preprocessor.T.COMMENT)) idx++;
    return idx;
  }

  // include: { 'filename': 'source content', ... } 文件名 -> 内容 的大对象
  constructor(include) {
    this.macros = new Map();   // name -> macro
    this.include = Object.assign({}, include || {}); // filename -> source text
  }

  // 后续设置/追加 include
  setInclude(obj) { this.include = Object.assign({}, obj || {}); return this; }
  addInclude(name, content) { this.include[name] = content; return this; }

  // 解析一条 #define 指令 (toks 为 #define 之后的 token 流, 不含 # 与 define 关键字)
  parseDefine(data) {
    let idx = Preprocessor.skipSpace(data, 0);
    if (!data[idx] || data[idx].t !== Preprocessor.T.ID) return; // 非法, 忽略
    const name = data[idx].v;
    idx++;
    // 判断函数式: 紧跟 ( 且中间无空白
    let params = null;
    if (data[idx] && data[idx].t === Preprocessor.T.PUNCT && data[idx].v === '(') {
      params = [];
      idx++;
      idx = Preprocessor.skipSpace(data, idx);
      if (data[idx] && !(data[idx].t === Preprocessor.T.PUNCT && data[idx].v === ')')) {
        while (true) {
          idx = Preprocessor.skipSpace(data, idx);
          if (!data[idx] || data[idx].t !== Preprocessor.T.ID) break;
          params.push(data[idx].v);
          idx++;
          idx = Preprocessor.skipSpace(data, idx);
          if (data[idx] && data[idx].t === Preprocessor.T.PUNCT && data[idx].v === ',') { idx++; continue; }
          break;
        }
      }
      // 跳到 )
      while (data[idx] && !(data[idx].t === Preprocessor.T.PUNCT && data[idx].v === ')')) idx++;
      if (data[idx]) idx++;
    }
    // 剩余作为 body (去掉首尾空白/注释/换行)
    let body = [];
    let started = false;
    for (let k = idx; data[k] && data[k].t !== Preprocessor.T.NEWLINE && data[k].t !== Preprocessor.T.EOF; k++) {
      const tk = data[k];
      if (tk.t === Preprocessor.T.WS || tk.t === Preprocessor.T.COMMENT) { if (started) body.push(tk); continue; }
      started = true; body.push(tk);
    }
    // 去除尾随空白/注释
    while (body.length && (body[body.length - 1].t === Preprocessor.T.WS || body[body.length - 1].t === Preprocessor.T.COMMENT)) body.pop();
    this.macros.set(name, { name, params, body });
  }

  undef(name) { this.macros.delete(name); }

  // 捕获函数式宏的实参: 从 '(' 开始 (data[idx].v==='('), 返回 {args: token[][], next: idxAfterParen}
  captureArgs(data, idx) {
    // data[idx] 应为 '('
    idx++; // 跳过 (
    const args = [[]];
    let depth = 1;
    while (data[idx] && data[idx].t !== Preprocessor.T.EOF) {
      const tk = data[idx];
      if (tk.t === Preprocessor.T.PUNCT && tk.v === '(') { depth++; args[args.length - 1].push(tk); idx++; continue; }
      if (tk.t === Preprocessor.T.PUNCT && tk.v === ')') {
        depth--;
        if (depth === 0) { idx++; break; }
        args[args.length - 1].push(tk); idx++; continue;
      }
      if (tk.t === Preprocessor.T.PUNCT && tk.v === ',' && depth === 1) { args.push([]); idx++; continue; }
      args[args.length - 1].push(tk); idx++;
    }
    // 规范化: 去掉每个实参首尾的空白/注释 (避免代入后残留多余空格)
    for (const a of args) {
      while (a.length && (a[0].t === Preprocessor.T.WS || a[0].t === Preprocessor.T.COMMENT)) a.shift();
      while (a.length && (a[a.length - 1].t === Preprocessor.T.WS || a[a.length - 1].t === Preprocessor.T.COMMENT)) a.pop();
    }
    return { args, next: idx };
  }

  // 把一段 token 序列重建为文本 (用于 # 字符串化)
  static tokensToText(data) {
    let s = '';
    for (const tk of data) s += tk.v;
    return s;
  }

  // 把实参 token 序列转成字符串字面量 (转义 " 与 \)
  static argToStringLit(data) {
    let inner = Preprocessor.tokensToText(data);
    inner = inner.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return '"' + inner + '"';
  }

  // 拼接两个 token 的 v 为一个新 token (类型按拼接结果推断)
  static glue(a, b) {
    const v = a.v + b.v;
    let t = Preprocessor.T.PUNCT;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) t = Preprocessor.T.ID;
    else if (/^[0-9]/.test(v)) t = Preprocessor.T.NUM;
    else if (v[0] === '"') t = Preprocessor.T.STR;
    return { t, v };
  }

  // 将 body 中的形参替换为对应实参 token, 并处理 # (字符串化) 与 ## (记号粘贴)
  substitute(body, params, args) {
    if (!params) return body.slice();
    const out = [];
    for (let k = 0; k < body.length; k++) {
      const tk = body[k];
      // ## 粘贴: 前一个 token 是 ## 已在下方消费, 这里跳过被粘贴掉的 token
      if (tk.t === Preprocessor.T.PUNCT && tk.v === '##') {
        // 找到 out 末尾待粘贴的左 token, 与下一个实参/记号拼
        const rhs = body[k + 1];
        if (rhs && out.length) {
          const lhs = out.pop();
          if (rhs.t === Preprocessor.T.ID && params.indexOf(rhs.v) >= 0) {
            // 右侧也是形参: 把实参 token 全部与 lhs 逐个拼接 (形参为空则只留 lhs)
            const arg = args[params.indexOf(rhs.v)] || [];
            if (arg.length === 0) { /* 空参: 仅保留 lhs */ }
            else if (arg.length === 1) { out.push(Preprocessor.glue(lhs, arg[0])); }
            else {
              // 多 token 实参: 左 paste 第一个, 之后连续 ## 由后续扫描处理;
              // 这里退化为把实参直接接上 (标准非平凡情形罕见, 取实用近似)
              out.push(lhs);
              for (const a of arg) out.push(a);
            }
          } else {
            out.push(Preprocessor.glue(lhs, rhs));
          }
          k++; // 跳过 rhs
          continue;
        }
        out.push(tk); continue;
      }
      // # 字符串化: 仅作用于紧跟的形参
      if (tk.t === Preprocessor.T.PUNCT && tk.v === '#') {
        const nx = body[k + 1];
        if (nx && nx.t === Preprocessor.T.ID && params.indexOf(nx.v) >= 0) {
          const lit = Preprocessor.argToStringLit(args[params.indexOf(nx.v)] || []);
          out.push({ t: Preprocessor.T.STR, v: lit });
          k++; continue;
        }
        // # 不跟形参: 原样保留
        out.push(tk); continue;
      }
      // 普通形参代入
      if (tk.t === Preprocessor.T.ID) {
        const pi = params.indexOf(tk.v);
        if (pi >= 0 && pi < args.length) { for (const a of args[pi]) out.push(a); continue; }
      }
      out.push(tk);
    }
    return out;
  }

  // 递归展开一条 token 流. active = Set<name> 当前激活宏 (防自引用/递归)
  expand(data, active) {
    const out = [];
    let i = 0;
    while (data[i] && data[i].t !== Preprocessor.T.EOF) {
      const tk = data[i];
      if (tk.t === Preprocessor.T.ID) {
        const m = this.macros.get(tk.v);
        if (m && !active.has(m.name)) {
          if (m.params === null) {
            // 对象式: 直接展开
            const na = new Set(active); na.add(m.name);
            const expanded = this.expand(m.body, na);
            for (const e of expanded) out.push(e);
            i++; continue;
          } else {
            // 函数式: 看下一个非空白 token 是否为 '('
            let j = Preprocessor.skipSpace(data, i + 1);
            if (data[j] && data[j].t === Preprocessor.T.PUNCT && data[j].v === '(') {
              const cap = this.captureArgs(data, j);
              const na = new Set(active); na.add(m.name);
              const subst = this.substitute(m.body, m.params, cap.args);
              const expanded = this.expand(subst, na);
              for (const e of expanded) out.push(e);
              i = cap.next; continue;
            }
            // 不是调用, 当普通标识符
            out.push(tk); i++; continue;
          }
        }
        out.push(tk); i++; continue;
      }
      // 字符串/字符/数字/标点/空白/注释: 原样透传
      out.push(tk); i++;
    }
    return out;
  }

  // ---- #if 常量表达式求值 (保守子集) ----
  // 支持: defined(X) / defined X, 已定义对象式宏取数值(否则 0), 数字(含 0x),
  // 括号, 一元 !/-/+, * / + - , 关系 < > <= >= , 相等 == != , 逻辑 && || 。
  // 双字符运算符在逐字符 tokenizer 下被切成两个 PUNCT, 这里用 takeOp() 合并预览。
  evalIf(data) {
    let i = 0;
    const twoOps = ['==', '!=', '<=', '>=', '&&', '||'];
    const self = this;
    function takeOp() {
      const a = data[i];
      if (!a || a.t !== Preprocessor.T.PUNCT) return null;
      const two = a.v + (data[i + 1] && data[i + 1].t === Preprocessor.T.PUNCT ? data[i + 1].v : '');
      if (twoOps.includes(two)) { i += 2; return two; }
      i += 1; return a.v;
    }
    function primary() {
      const tk = data[i];
      if (!tk) return 0;
      if (tk.t === Preprocessor.T.PUNCT && tk.v === '(') { i++; const v = lor(); if (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === ')') i++; return v; }
      if (tk.t === Preprocessor.T.ID && tk.v === 'defined') {
        i++;
        let name = null;
        if (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === '(') { i++; name = data[i] ? data[i].v : null; if (data[i]) i++; if (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === ')') i++; }
        else { name = data[i] ? data[i].v : null; if (data[i]) i++; }
        return self.macros.has(name) ? 1 : 0;
      }
      if (tk.t === Preprocessor.T.NUM) { i++; const v = tk.v; return parseInt(v, (v[0] === '0' && (v[1] === 'x' || v[1] === 'X')) ? 16 : 10) || 0; }
      if (tk.t === Preprocessor.T.ID) {
        i++;
        const m = self.macros.get(tk.v);
        if (m && m.params === null) {
          const txt = Preprocessor.tokensToText(m.body).trim();
          if (txt[0] === '0' && (txt[1] === 'x' || txt[1] === 'X')) return parseInt(txt, 16) || 0;
          const n = parseInt(txt, 10); return isNaN(n) ? 0 : n;
        }
        return 0;
      }
      i++; return 0;
    }
    function unary() {
      if (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === '!') { i++; return unary() ? 0 : 1; }
      if (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === '-') { i++; return -unary(); }
      if (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === '+') { i++; return unary(); }
      return primary();
    }
    function mul() { let v = unary(); while (data[i] && data[i].t === Preprocessor.T.PUNCT && (data[i].v === '*' || data[i].v === '/')) { const op = data[i].v; i++; const r = unary(); v = op === '*' ? v * r : Math.trunc(v / r); } return v; }
    function add() { let v = mul(); while (data[i] && data[i].t === Preprocessor.T.PUNCT && (data[i].v === '+' || data[i].v === '-')) { const op = data[i].v; i++; const r = mul(); v = op === '+' ? v + r : v - r; } return v; }
    function rel() { let v = add(); while (data[i] && data[i].t === Preprocessor.T.PUNCT && (data[i].v === '<' || data[i].v === '>')) { const op = data[i].v; i++; const r = add(); v = (op === '<' ? v < r : v > r) ? 1 : 0; } return v; }
    function eq() { let v = rel(); while (data[i] && data[i].t === Preprocessor.T.PUNCT && (data[i].v === '==' || data[i].v === '!=')) { const op = data[i].v; i++; const r = rel(); v = (op === '==' ? v === r : v !== r) ? 1 : 0; } return v; }
    function land() { let v = eq(); while (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === '&&') { i++; const r = eq(); v = (v && r) ? 1 : 0; } return v; }
    function lor() { let v = land(); while (data[i] && data[i].t === Preprocessor.T.PUNCT && data[i].v === '||') { i++; const r = land(); v = (v || r) ? 1 : 0; } return v; }
    return lor() ? 1 : 0;
  }

  // ---- 数组维度 / 初始化器 常量表达式折叠 (M4) ----
  // 取已定义对象式宏中"纯数值"的那些, 拼成 const 声明注入 eval 作用域.
  macroConstScope() {
    const decls = [];
    for (const [name, m] of this.macros) {
      if (m.params !== null) continue;
      const txt = Preprocessor.tokensToText(m.body).trim();
      if (/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(txt)) decls.push(`${name}=${txt}`);
    }
    return decls.join(',');
  }

  // 把 token 序列 eval 成一个数值; 失败 (未知标识符等) 抛错, 由调用方提示.
  evalExprTokens(data, where) {
    let expr = '';
    for (const tk of data) {
      if (tk.t === Preprocessor.T.WS || tk.t === Preprocessor.T.COMMENT || tk.t === Preprocessor.T.NEWLINE) continue;
      expr += tk.v;
    }
    expr = expr.trim();
    if (expr === '') throw new Error(`[预处理器] ${where}: 空表达式`);
    const scope = this.macroConstScope();
    let val;
    try {
      const body = (scope ? 'const ' + scope + '; ' : '') + 'return (' + expr + ');';
      const fn = new Function('"use strict"; ' + body);
      val = fn();
    } catch (e) {
      throw new Error(`[预处理器] ${where}: 无法求值的常量表达式 "${expr}" (含未知标识符或非法语法): ${e.message}`);
    }
    if (typeof val !== 'number' || !isFinite(val)) {
      throw new Error(`[预处理器] ${where}: 表达式 "${expr}" 求值结果非有限数: ${val}`);
    }
    return val;
  }

  isArrayInitBrace(tokens, fromIdx) {
    let j = fromIdx - 1;
    while (j >= 0 && (tokens[j].t === Preprocessor.T.WS || tokens[j].t === Preprocessor.T.COMMENT || tokens[j].t === Preprocessor.T.NEWLINE)) j--;
    if (j < 0) return false;
    const tk = tokens[j];
    return tk.t === Preprocessor.T.PUNCT && (tk.v === '=' || tk.v === ']');
  }

  // 类型关键字集合: 用于区分"数组维度声明"与"数组下标访问".
  static TYPE_KW = new Set(['int','char','const','void','struct','union','unsigned',
    'signed','long','short','static','volatile','enum','float','double','bool','u8','u16','u32','s8','s16','s32']);

  isDimensionBracket(tokens, openIdx) {
    let j = openIdx - 1;
    while (j >= 0 && (tokens[j].t === Preprocessor.T.WS || tokens[j].t === Preprocessor.T.COMMENT || tokens[j].t === Preprocessor.T.NEWLINE)) j--;
    if (j < 0) return false;
    const tk = tokens[j];
    if (tk.t === Preprocessor.T.PUNCT && tk.v === ']') return true;
    if (tk.t === Preprocessor.T.ID && Preprocessor.TYPE_KW.has(tk.v)) return true;
    if (tk.t === Preprocessor.T.ID) {
      let k = j - 1;
      while (k >= 0 && (tokens[k].t === Preprocessor.T.WS || tokens[k].t === Preprocessor.T.COMMENT || tokens[k].t === Preprocessor.T.NEWLINE)) k--;
      if (k >= 0 && tokens[k].t === Preprocessor.T.ID && Preprocessor.TYPE_KW.has(tokens[k].v)) return true;
      return false;
    }
    return false;
  }

  collectBracket(tokens, openIdx) {
    const open = tokens[openIdx].v;
    const close = open === '[' ? ']' : '}';
    let depth = 1, i = openIdx + 1;
    while (i < tokens.length) {
      const tk = tokens[i];
      if (tk.t === Preprocessor.T.PUNCT && tk.v === open) depth++;
      else if (tk.t === Preprocessor.T.PUNCT && tk.v === close) {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    return -1;
  }

  isPureLiteral(data) {
    for (const tk of data) {
      if (tk.t === Preprocessor.T.WS || tk.t === Preprocessor.T.COMMENT || tk.t === Preprocessor.T.NEWLINE) continue;
      if (tk.t === Preprocessor.T.NUM) continue;
      return false;
    }
    return true;
  }

  foldInitElems(tokens, start, end, where) {
    let depth = 0;
    let segStart = start;
    const replaceRanges = [];
    for (let i = start; i < end; i++) {
      const tk = tokens[i];
      if (tk.t === Preprocessor.T.PUNCT && (tk.v === '[' || tk.v === '{')) depth++;
      else if (tk.t === Preprocessor.T.PUNCT && (tk.v === ']' || tk.v === '}')) depth--;
      else if (tk.t === Preprocessor.T.PUNCT && tk.v === ',' && depth === 0) {
        let s = segStart, e = i - 1;
        while (s <= e && (tokens[s].t === Preprocessor.T.WS || tokens[s].t === Preprocessor.T.COMMENT || tokens[s].t === Preprocessor.T.NEWLINE)) s++;
        while (e >= s && (tokens[e].t === Preprocessor.T.WS || tokens[e].t === Preprocessor.T.COMMENT || tokens[e].t === Preprocessor.T.NEWLINE)) e--;
        if (s <= e) {
          const core = tokens.slice(s, e + 1);
          if (!this.isPureLiteral(core)) {
            const val = this.evalExprTokens(core, where);
            replaceRanges.push({ s, e, val });
          }
        }
        segStart = i + 1;
      }
    }
    let s = segStart, e = end - 1;
    while (s <= e && (tokens[s].t === Preprocessor.T.WS || tokens[s].t === Preprocessor.T.COMMENT || tokens[s].t === Preprocessor.T.NEWLINE)) s++;
    while (e >= s && (tokens[e].t === Preprocessor.T.WS || tokens[e].t === Preprocessor.T.COMMENT || tokens[e].t === Preprocessor.T.NEWLINE)) e--;
    if (s <= e) {
      const core = tokens.slice(s, e + 1);
      if (!this.isPureLiteral(core)) {
        const val = this.evalExprTokens(core, where);
        replaceRanges.push({ s, e, val });
      }
    }
    for (let k = replaceRanges.length - 1; k >= 0; k--) {
      const r = replaceRanges[k];
      tokens.splice(r.s, r.e - r.s + 1, { t: Preprocessor.T.NUM, v: String(r.val) });
    }
  }

  foldArrayExpr(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (tk.t !== Preprocessor.T.PUNCT) continue;
      if (tk.v === '[') {
        const close = this.collectBracket(tokens, i);
        if (close < 0) continue;
        if (!this.isDimensionBracket(tokens, i)) { i = close; continue; }
        const inner = tokens.slice(i + 1, close);
        if (!this.isPureLiteral(inner)) {
          const val = this.evalExprTokens(inner, '数组维度 [' + Preprocessor.tokensToText(inner).trim() + ']');
          tokens.splice(i + 1, close - i - 1, { t: Preprocessor.T.NUM, v: String(val) });
        }
      } else if (tk.v === '{' && this.isArrayInitBrace(tokens, i)) {
        const close = this.collectBracket(tokens, i);
        if (close < 0) continue;
        this.foldInitElems(tokens, i + 1, close, '数组初始化器');
      }
    }
    return tokens;
  }

  // ---- 主入口 ----
  // 入参 src 为待预处理源码; 返回拍平后的 C 源码文本.
  // #include "xxx" / <xxx> 优先从构造时传入的 include 对象 (文件名->内容) 中取;
  // 找不到则忽略该包含.
  preprocessing(src) {
    const toksAll = Preprocessor.tokenize(src);
    const lines = [];
    let cur = [];
    for (const tk of toksAll) {
      if (tk.t === Preprocessor.T.NEWLINE) { lines.push(cur); cur = []; continue; }
      if (tk.t === Preprocessor.T.EOF) { if (cur.length) lines.push(cur); break; }
      cur.push(tk);
    }

    const out = [];
    const ifStack = [];
    const parentActive = () => ifStack.slice(0, -1).every(f => f.selected);
    const isActive = () => ifStack.every(f => f.selected);

    const handle = (cmd, args) => {
      switch (cmd) {
        case 'define': this.parseDefine(args); break;
        case 'undef': if (args[0] && args[0].t === Preprocessor.T.ID) this.undef(args[0].v); break;
        case 'ifdef': {
          const nm = args[0] && args[0].t === Preprocessor.T.ID ? args[0].v : '';
          const c = this.macros.has(nm);
          ifStack.push({ selected: parentActive() && c, done: c });
          break;
        }
        case 'ifndef': {
          const nm = args[0] && args[0].t === Preprocessor.T.ID ? args[0].v : '';
          const c = !this.macros.has(nm);
          ifStack.push({ selected: parentActive() && c, done: c });
          break;
        }
        case 'if': {
          const c = !!this.evalIf(args);
          ifStack.push({ selected: parentActive() && c, done: c });
          break;
        }
        case 'elif': {
          const top = ifStack[ifStack.length - 1];
          if (!top) break;
          if (!top.done) {
            const c = !!this.evalIf(args);
            if (c && parentActive()) top.selected = true;
            if (c) top.done = true;
          }
          break;
        }
        case 'else': {
          const top = ifStack[ifStack.length - 1];
          if (!top) break;
          if (top.done) top.selected = false;
          else { top.selected = parentActive(); top.done = true; }
          break;
        }
        case 'endif': {
          if (ifStack.length) ifStack.pop();
          break;
        }
        case 'include': {
          if (!isActive()) break;
          let fname = null;
          if (args[0] && args[0].t === Preprocessor.T.STR) fname = args[0].v.slice(1, -1);
          else if (args[0] && args[0].t === Preprocessor.T.PUNCT && args[0].v === '<') {
            let j = 1; while (args[j] && !(args[j].t === Preprocessor.T.PUNCT && args[j].v === '>')) j++;
            fname = Preprocessor.detokenize(args.slice(1, j)).trim();
          }
          if (fname && Object.prototype.hasOwnProperty.call(this.include, fname)) {
            const inc = this.include[fname];
            const subToks = Preprocessor.tokenize(this.preprocessing(inc));
            for (const tk of subToks) out.push(tk);
          }
          break;
        }
        default:
          break;
      }
    };

    for (const line of lines) {
      let s = 0;
      while (line[s] && (line[s].t === Preprocessor.T.WS || line[s].t === Preprocessor.T.COMMENT)) s++;
      if (!line[s]) { out.push({ t: Preprocessor.T.NEWLINE, v: '\n' }); continue; }
      if (line[s].t === Preprocessor.T.PUNCT && line[s].v === '#') {
        s++;
        while (line[s] && (line[s].t === Preprocessor.T.WS || line[s].t === Preprocessor.T.COMMENT)) s++;
        if (!line[s] || line[s].t !== Preprocessor.T.ID) { out.push({ t: Preprocessor.T.NEWLINE, v: '\n' }); continue; }
        const cmd = line[s].v; s++;
        const args = line.slice(s).filter(t => t.t !== Preprocessor.T.WS && t.t !== Preprocessor.T.COMMENT);
        handle(cmd, args);
        out.push({ t: Preprocessor.T.NEWLINE, v: '\n' });
        continue;
      }
      if (isActive()) {
        const expanded = this.expand(line, new Set());
        for (const tk of expanded) out.push(tk);
      }
      out.push({ t: Preprocessor.T.NEWLINE, v: '\n' });
    }
    this.foldArrayExpr(out);
    return Preprocessor.detokenize(out);
  }
}

class RegBackend {
  // options: 可选对象, 用于在不修改代码/不依赖 process.env 的前提下
  // 开关各优化阶段与调试输出. 任一字段省略时, 会回退到同名 process.env
  // 环境变量 (方便 shell 调试), 都没有则取下方默认值.
  //
  // 字段一览 (语义化短名, 对应原环境变量):
  //   noDeadMove    : 关闭死移动消除             (原 C4_NO_DEADMOVE)
  //   noHoistImm    : 关闭循环不变立即数物化     (原 C4_NO_HOISTIMM)
  //   noDeadFn      : 关闭死函数消除             (原 C4_NO_DEADFN)
  //   noTrimMask    : 关闭 mask 裁剪             (原 C4_NO_TRIMMASK)
  //   noGlobalDCE   : 关闭全局死代码消除         (原 C4_NO_GLOBALDCE)
  //   noCacheBase   : 关闭 cache base 优化       (原 C4_NO_CACHEBASE)
  //   noFuncHoist   : 关闭函数级 hoist           (原 C4_NO_FUNCHOIST)
  //   noGlobalRLE   : 关闭全局 RLE               (原 C4_NO_GLOBALRLE)
  //   noDeadSpill   : 关闭死 spill 消除          (原 C4_NO_DEADSPILL)
  //   disableGlobal : 关闭全局优化总开关         (原 DISABLE_GLOBAL)
  //   fullReg       : 启用更激进的全寄存器分配   (原 C4_FULLREG)
  //   fullRegDebug  : 打印 fullreg 各阶段详情   (原 C4_FULLREG_DEBUG)
  //   debugDCE      : DCE 删除时打印细节         (原 C4_DEBUG_DCE)
  //   chkStack      : 运行期校验 ENTER/LEAVE 栈平衡(原 C4_CHKSTACK)
  //
  // 示例:
  //   const be = new RegBackend(2, { fullReg:true, fullRegDebug:true });
  //   // 或 shell: C4_FULLREG=1 C4_FULLREG_DEBUG=1 node c4_compiler.js ...
  constructor(optLevel, options){
    this.code=[]; this.ip=-1; this.lastOpcode=-1;
    this.optLevel = optLevel || 0;
    // env -> options 合并: 显式 options 优先, 否则取 process.env, 再否则取默认 false
    const env = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const bool = (opt, envName, dflt) =>
      (opt !== undefined) ? !!opt
      : (envName in env) ? !!env[envName]
      : dflt;
    this.opts = {
      noDeadMove:    bool(options && options.noDeadMove,    'C4_NO_DEADMOVE',    false),
      noHoistImm:    bool(options && options.noHoistImm,    'C4_NO_HOISTIMM',    false),
      noDeadFn:      bool(options && options.noDeadFn,      'C4_NO_DEADFN',      false),
      noTrimMask:    bool(options && options.noTrimMask,    'C4_NO_TRIMMASK',    false),
      noGlobalDCE:   bool(options && options.noGlobalDCE,   'C4_NO_GLOBALDCE',   false),
      noCacheBase:   bool(options && options.noCacheBase,   'C4_NO_CACHEBASE',   false),
      noFuncHoist:   bool(options && options.noFuncHoist,   'C4_NO_FUNCHOIST',   false),
      noGlobalRLE:   bool(options && options.noGlobalRLE,   'C4_NO_GLOBALRLE',   false),
      noDeadSpill:   bool(options && options.noDeadSpill,   'C4_NO_DEADSPILL',   false),
      disableGlobal: bool(options && options.disableGlobal, 'DISABLE_GLOBAL',    false),
      fullReg:       bool(options && options.fullReg,       'C4_FULLREG',        false),
      fullRegDebug:  bool(options && options.fullRegDebug,  'C4_FULLREG_DEBUG',  false),
      debugDCE:      bool(options && options.debugDCE,      'C4_DEBUG_DCE',      false),
      chkStack:      bool(options && options.chkStack,      'C4_CHKSTACK',       false),
    };
    // 虚拟比较标志 (CMP/CMPI 设置, Jcc 读取)
    this._cmpEq=false; this._cmpLt=false;
    // 分段管理
    this.funcSegments=[];  // [{name, code:[], baseAddr:0, length:0, hotConsts:[]}]
    this.inFunc=false;
    this.funcCode=[]; this.funcIp=-1;
    this.funcCallFixups=[]; // [{pos, targetFuncId, localTarget}]
    this.funcAddrFixups=[]; // [{segIdx, wordPos, symIdx}] — function address refs for patching
    this._debug=false; // set to true for verbose output
  }
  reset(){this.code=[];this.ip=-1;this.lastOpcode=-1;this.funcSegments=[];this.inFunc=false;this.funcCode=[];this.funcIp=-1;this.funcCallFixups=[];this._tacColors=[];this._funcColorIdx=0;}
  beginFunc(){
    this.inFunc=true;this.funcCode=[];this.funcIp=-1;this.funcCallFixups=[];
    this._curParamCount=0;
    this._labels={}; this._nextLabel=1;
    this._tacColors=[]; // 重置当前函数染色
    this._funcColorIdx=0; // 由 endFunc 分配
  }
  allocLabel(){return this._nextLabel++;}
  setLabel(id){this._labels[id]=this.funcIp+1;}
  setLabelAt(id,wi){this._labels[id]=wi;}
  setParamCount(n){this._curParamCount=n;}
  endFunc(name){
    this.inFunc=false;
    const funcId=this.funcSegments.length;
    this._funcColorIdx=funcId+1;
    // 给未染色的指令赋上函数色
    for(let i=0;i<this._tacColors.length;i++){
      if(this._tacColors[i]===0) this._tacColors[i]=this._funcColorIdx;
    }
    const seg={name,code:[...this.funcCode],baseAddr:0,length:(this.funcIp+1)*4,callFixups:[...this.funcCallFixups],paramCount:this._curParamCount||0,hotConsts:[],labelTable:{...this._labels},colors:[...this._tacColors],funcId};
    this.funcSegments.push(seg);
    return funcId;
  }
  emit(...w){
    const color=this._curEmitColor||0;
    if(this.inFunc){
      for(const v of w){this.funcCode[++this.funcIp]=v;this._tacColors[this.funcIp]=color;}
      if(w.length>0)this.lastOpcode=w[0];return;
    }
    for(const v of w){this.code[++this.ip]=v;this._tacColors[this.ip]=color;}
    if(w.length>0)this.lastOpcode=w[0];
  }
  _setEmitColor(c){this._curEmitColor=c;}
  _clearEmitColor(){this._curEmitColor=0;}
  here(){
    if(this.inFunc)return(this.funcIp+1)*4;
    return(this.ip+1)*4;
  }
  patch(p,v){
    if(this.inFunc){this.funcCode[p>>2]=v;return;}
    this.code[p>>2]=v;
  }
  recordCallFixup(pos,symIdx){
    this.funcCallFixups.push({pos,symIdx});
  }
  // 在 finalizeLayout 后调用, 解析跨函数 CALL 目标
  resolveCallFixups(sysboltable){
    for(const seg of this.funcSegments){
      for(const fx of seg.callFixups){
        const sym=sysboltable[fx.symIdx];
        if(sym && sym.FuncId>=0){
          const tgtSeg = this.funcSegments[sym.FuncId];
          if(tgtSeg){
            const baseIdx = seg.baseAddr/4;
            // CALL 格式: [opcode, target], target 在 opcode 之后第二个字
            this.code[baseIdx+(fx.pos>>2)+1] = tgtSeg.baseAddr;
          }
        }
      }
    }
  }

  resolveLabels(){
    for(const seg of this.funcSegments){
      const lt=seg.labelTable;
      if(!lt) continue;
      for(let i=0;i<seg.code.length;){
        const opc=seg.code[i];
        if(opc===59||(opc>=42&&opc<=47)){
          // JMP/Jcc: code[i+1] 是标签 ID (负) 或字节偏移 (正)
          if(seg.code[i+1]<0){
            const lbl=-seg.code[i+1];
            seg.code[i+1]=lt[lbl]!==undefined ? (lt[lbl]<<2) : 0;
          }
          i+=2;
        }else if(opc===60||opc===61){
          // JZ/JNZ: code[i+2] 是目标
          if(seg.code[i+2]<0){
            const lbl=-seg.code[i+2];
            seg.code[i+2]=lt[lbl]!==undefined ? (lt[lbl]<<2) : 0;
          }
          i+=3;
        }else i+=instrLen(opc);
      }
    }
  }

  // =====================================================================
  // Peephole 简化器 (TAC-to-TAC)
  // ---------------------------------------------------------------------
  // 在 finalizeLayout 之前对每个函数段的指令流做局部窥孔优化。
  // 由于本 VM 每条指令 dispatch 计 1 cycle, 删除指令可直接降低 cycle 数。
  // 删除/替换后会压缩代码并按字级重映射所有"按位置记录"的数据:
  //   - seg.labelTable   (labelId → 字索引)
  //   - seg.callFixups   (pos = CALL 字节偏移)
  //   - funcAddrFixups   (wordPos = 函数指针 MOVI 立即数字索引)
  //   - seg.colors       (与 code 平行的 TAC 染色)
  // 因此对后续 resolveLabels / finalizeLayout / resolveCallFixups 完全透明。
  //
  // 支持的模式 (均为保语义的经典窥孔):
  //   P1  MOV rd, rd                       → 删除 (自赋值)
  //   P2  STORE_OFF s,rs ; LOAD_OFF rd,s   → LOAD 改写为 MOV rd,rs (存储转发);
  //                                           若 rd===rs 直接删除 LOAD
  //   P3  LOAD_OFF rd1,s ; LOAD_OFF rd2,s  → 第二条改写为 MOV rd2,rd1 (冗余重载);
  //                                           若 rd1===rd2 直接删除
  //   P4  JMP L (L 恰为紧邻的下一条指令)    → 删除 (跳到相邻处即 fallthrough)
  //   P5  <纯寄存器写 rd> ; <下一条重写 rd 且不读 rd> → 删除前者 (死寄存器写)
  //   P6  PUSH ra ; POP rb                 → 合并为 MOV rb,ra; 若 ra===rb 全删
  //   P7  代数恒等式 (单指令, 无块首约束): ADDI/SUBI imm=0 / MULI imm=1 /
  //       DIVI imm=1 / ORI/XORI imm=0 / SHLI/SHRI imm=0 → MOV rd,rs (rd==rs 删);
  //       MULI imm=0 / MODI imm=1 / ANDI imm=0 → MOVI rd,0;
  //       SUB/XOR rs,rs / LT/GT self → MOVI rd,0; AND/OR rs,rs → MOV rd,rs;
  //       EQ→1 / NE→0 / LE/GE self→1. (长度 4字→3字, remap 已支持)
  //   P8  跳转线程 + 冗余跳: 任意跳(JMP/JZ/JNZ/Jcc)若目标块首为 JMP → 重定到其终目标
  //       (链式跟随防环); 跳到紧邻下一条 → 删除 (无条件/条件都冗余). 受块首屏障.
  //
  // P5/P6 专为本 codegen 大量出现的 "PUSH r0; MOV r0,rX; POP r0" 表达式
  // 保存/恢复惯用法而设: 其中 MOV 是死写 (随即被 POP 覆盖), 删除后
  // PUSH/POP 相邻抵消 → 整段折叠。
  //
  // 安全规则:
  //   * 跳转目标 (基本块首) 视为屏障: 配对/转发模式不跨越它。
  //   * P5 删除的是"纯寄存器写"(算术/MOV/MOVI/LDA/LEA/各类 LOAD): 它们
  //     除写目标寄存器外无副作用, 且为直线指令, 下一条必然执行并覆盖目标,
  //     故删除对任何路径都安全 (即使目标是跳转目标)。
  //   * P6 要求 POP 非跳转目标 (否则可能有别处 PUSH 的值从此进入)。
  //   * 仅处理整字 LOAD_OFF/STORE_OFF; 字节/半字含截断与符号扩展,
  //     不能等价为 MOV。
  // =====================================================================
  peephole(){
    let removed=0, guard=0, changed=true;
    // 内联门控:
    //   -O5 (最小体积): 关闭内联 (内联会膨胀代码), 仅保留缩体 pass (LICM/GCSE/GRA/DCE).
    //   -O4 (最大速度): 激进内联 (多出口 + 寄存器溢出 PUSH/POP + 大函数).
    //   -O1/-O2/-O3:    保守内联 (leaf/单出口/无内存/小函数, 寄存器不够则放弃).
    const doInline = this.optLevel!==0 && this.optLevel!==5;
    const inlineAggr = this.optLevel>=4;
    // 定点迭代: C 层 (拷贝传播 / DCE / CSE) 与 B 层 (_peepholeSeg 的 P1..P8)
    // 互相促进 — 例如拷贝传播暴露死写供 DCE 删除, P7/P8 又进一步精简.
    while(changed && guard++<30){
      changed=false;
      for(const seg of this.funcSegments){
        if(this._globalEnabled() && this._tacLICM(seg)) changed=true;   // 全局 LICM: 先于本地 pass, 便于后续清理
        if(!this.opts.noDeadMove && this._tacElimDeadMove(seg)) changed=true; // 死移动消除: 释放寄存器供下游 pass 物化常量
        if(!this.opts.noHoistImm && this._globalEnabled() && this._tacHoistImm(seg)) changed=true; // Pass 5 常量: 循环不变 ALU 立即数物化 + MOVI 多定义同值外提 (方案 B+C)
        if(this._globalEnabled() && this._tacCacheLoopBase(seg)) changed=true; // ⑤-B/C: 循环不变全局基址缓存 (-O1+ 默认启用)
        if(this._globalEnabled() && this._tacFuncHoistConst(seg)) changed=true; // P1: 函数级常量/地址提升 (LDA/MOVI 外提至入口)
        if(this._globalEnabled() && this._tacGCSE(seg)) changed=true;    // 全局 CSE (跨块 commoning), 置于 copyProp 之前收尾
        if(this._globalEnabled() && doInline && this._tacInline(seg, inlineAggr)) changed=true; // #25 过程间小函数内联 (调用图+mod/ref 门控)
        if(this.peepholeCopyProp(seg)) changed=true;
        if(this._peepholeDCE(seg)>0) changed=true;
        if(this._globalEnabled() && this._tacGlobalDCE(seg)>0) changed=true; // 全局 DCE: 删跨块死写 (MOV/MOVI/算术/LOAD)
        if(this._globalEnabled() && this._tacGlobalRLE(seg)) changed=true; // P3: 全局地址冗余加载转发 + 死存储消除
        if(this._globalEnabled() && this._tacElimDeadSpill(seg)>0) changed=true; // 冗余 scratch 溢出 (PUSH/POP) 消除
        if(this.peepholeCSE(seg)>0) changed=true;
        const d=this._peepholeSeg(seg); if(d>0){ changed=true; removed+=d; }
      }
    }
    // F 层: 死函数消除 (dead function elimination) — O2+ 启用.
    // 内联会把小函数体嵌入调用者并移除调用点的 callFixup, 但被内联函数的 seg 本体仍残留
    // (如 writedata 被内联后, 其 ENTER/LEAVE 桩仍占 ROM). 此外 __weak 被同名非弱函数覆盖后,
    // 弱定义本体也再无调用者. 本阶段以调用图可达性判定, 删除这些"无引用且无根"的函数段,
    // 并重建 funcSegments 索引 (同步 sysboltable[].FuncId 与 funcAddrFixups[].segIdx).
    // 必须在 regalloc(E) 之前: 删除后段数组更短, 下游 pass 少跑且索引已稳定.
    // 根集合 = main 入口 + 所有中断向量 (__interrupt_N) 入口; 其余仅由 callFixups / 函数指针
    // (funcAddrFixups) 可达的函数保留, 不可达者整段删除.
    if (this.optLevel >= 2 && !this.opts.noDeadFn) this._eliminateDeadFunctions();
    // D 层: 保守线性扫描寄存器分配 — 必须放在最后, 避免 DCE/P5 把入口加载当死写删除
    let ra=0;
    for(const seg of this.funcSegments){ if(this.peepholeRegAlloc(seg)) ra++; }
    // E 层: 裁剪 ENTER/LEAVE mask 中"被保存但从未使用"的 callee 寄存器 (PUSH/POP 纯浪费).
    // 必须在 peepholeRegAlloc 之后: regalloc 可能为本函数提升槽位而设置 mask 位.
    let tm=0;
    for(const seg of this.funcSegments){ if(this._tacTrimCalleeMask(seg)) tm++; }
    return removed + ra + tm;
  }

  // =====================================================================
  // F 层优化 pass: 死函数消除 (dead function elimination)
  // ---------------------------------------------------------------------
  // 问题: 过程间内联 (_tacInline) 把小函数体嵌入调用者, 并移除调用点的 callFixup,
  //   但被内联函数自身的 seg 本体不会消失 (如 writedata 被内联后, ENTER/LEAVE 桩仍占 ROM).
  //   同理 __weak 被同名非弱函数覆盖后, 弱定义本体也无任何调用者. 这些"孤岛"应整段删除.
  // 算法: 以调用图可达性判定存活函数.
  //   根集合 = main 入口 (_mainFuncId) + 所有中断向量入口 (_interruptSlots 中的函数名).
  //   被引用 = 任意 seg 的 callFixups 指向 (静态调用) + 任意 funcAddrFixups 指向 (函数指针).
  //   从根做 worklist 遍历 callFixups 扩展可达集; 再并入"被引用"集 (函数指针目标未必在静态
  //   调用图里, 但被取地址就必须保留). 不可达函数即从 funcSegments 删除, 并重建索引:
  //     - 保留的 seg.funcId 重排为连续下标;
  //     - sysboltable[].FuncId 同步重映射 (被删者置 -1);
  //     - funcAddrFixups[].segIdx 重映射, 源段被删者移除该 fixup.
  //   删除仅移除"定义", 不影响任何存活函数的 callFixups (其 symIdx 仍指向符号, 符号 FuncId
  //   已更新为新的连续下标, 故 resolveCallFixups 在 finalizeLayout 后解析仍正确).
  // 在 _globalEnabled/O2+ 启用 (env C4_NO_DEADFN=1 可关闭对照). 仅在 peephole 定点循环之后调用.
  _eliminateDeadFunctions(){
    const sys=this.sysboltable;
    if(!sys) return 0;
    const n=this.funcSegments.length;
    if(n===0) return 0;
    const roots=new Set();
    if(this._mainFuncId!==undefined && this._mainFuncId>=0 && this._mainFuncId<n) roots.add(this._mainFuncId);
    // 中断向量入口根 (按函数名匹配 seg.name)
    if(this._interruptSlots){
      for(const fname of Object.values(this._interruptSlots)){
        for(let i=0;i<n;i++){ if(this.funcSegments[i] && this.funcSegments[i].name===fname){ roots.add(i); break; } }
      }
    }
    // 收集被引用 (callFixups 与 funcAddrFixups 指向的函数 FuncId)
    const referenced=new Set();
    const addRef=(symIdx)=>{
      const s=sys[symIdx];
      if(s && s.Class===tokens.Fun && s.FuncId>=0 && s.FuncId<n) referenced.add(s.FuncId);
    };
    for(let i=0;i<n;i++){
      const seg=this.funcSegments[i];
      if(!seg) continue;
      for(const fx of (seg.callFixups||[])) addRef(fx.symIdx);
    }
    for(const fx of (this.funcAddrFixups||[])) addRef(fx.symIdx);
    // worklist: 从根扩展可达
    const alive=new Set();
    const work=[...roots];
    while(work.length){
      const fid=work.pop();
      if(fid<0||fid>=n||alive.has(fid)) continue;
      alive.add(fid);
      const seg=this.funcSegments[fid];
      if(!seg) continue;
      for(const fx of (seg.callFixups||[])){
        const s=sys[fx.symIdx];
        if(s && s.Class===tokens.Fun && s.FuncId>=0 && s.FuncId<n && !alive.has(s.FuncId)) work.push(s.FuncId);
      }
    }
    // 函数指针目标 (被取地址) 也必须保留
    for(const fid of referenced){ if(!alive.has(fid)){ alive.add(fid); } }
    const removed=n-alive.size;
    if(removed===0) return 0;
    // 重建 funcSegments 与索引映射
    const old2new=new Array(n).fill(-1);
    const newSegs=[];
    for(let i=0;i<n;i++){
      if(alive.has(i)){
        const seg=this.funcSegments[i];
        seg.funcId=newSegs.length;
        old2new[i]=newSegs.length;
        newSegs.push(seg);
      }
    }
    this.funcSegments=newSegs;
    // 同步 sysboltable[].FuncId
    for(let si=0;si<sys.length;si++){
      const s=sys[si];
      if(s && s.Class===tokens.Fun && s.FuncId>=0){
        s.FuncId = (s.FuncId<n) ? old2new[s.FuncId] : s.FuncId;
        if(s.FuncId<0) s.FuncId=-1;
      }
    }
    // 重映射 funcAddrFixups (源段被删则移除)
    if(this.funcAddrFixups){
      const newFix=[];
      for(const fx of this.funcAddrFixups){
        const ns=(fx.segIdx!==undefined && fx.segIdx<n) ? old2new[fx.segIdx] : fx.segIdx;
        if(ns<0) continue;
        fx.segIdx=ns;
        newFix.push(fx);
      }
      this.funcAddrFixups=newFix;
    }
    return removed;
  }

  // =====================================================================
  // E 层优化 pass: 裁剪无用 callee 保存位 (ENTER/LEAVE mask 瘦身)
  // ---------------------------------------------------------------------
  // 动机: 前端 allocCalleeReg 按"可能用到"把 R4/R6/R7 纳入 ENTER mask, 但函数体经
  //   DCE / 死移动消除 / 内联后, 某些被保存的 callee 寄存器在整个函数体内再无任何
  //   读或写 —— 对应的 prologue PUSH {Rx} / epilogue POP {Rx} 纯属浪费 (各 2B, 共 4B/寄存器).
  // 修正: 扫描函数体 (跳过 ENTER/LEAVE 自身), 若某被保存的 callee 寄存器 (R4/R6/R7)
  //   在全程无 def 且无 use, 则从 ENTER 高字节 mask 与所有 LEAVE 低字节 mask 中清除该位.
  //   后端 prologue/epilogue 严格按 mask 生成 PUSH/POP, 故清除后自动省掉一对 PUSH/POP.
  // 安全性: 该寄存器本就未读写, 保存/恢复无任何语义作用; 高寄存器 R8-R11 不经此 mask
  //   (由后端显式 PUSH/POP 配对保护), 不受影响. 仅在 _globalEnabled (-O1+) 启用,
  //   可用 C4_NO_TRIMMASK=1 关闭做对照.
  // =====================================================================
  _tacTrimCalleeMask(seg){
    if(this.opts.noTrimMask) return false;
    if(!this._globalEnabled()) return false;
    const O=opcode, code=seg.code;
    if(!code || code.length<2 || code[0]!==O.ENTER) return false;
    const instrs=[]; for(let i=0;i<code.length;){ const opc=code[i],len=instrLen(opc); instrs.push({op:opc,i,len}); i+=len; }
    const enterMask=(code[1]>>8)&0xFF;
    const saved=[]; for(const r of [4,6,7]) if(enterMask&(1<<r)) saved.push(r);
    if(saved.length===0) return false;
    const used=new Set();
    for(const ins of instrs){
      const o=ins.op, i=ins.i;
      if(o===O.ENTER||o===O.LEAVE) continue;
      for(const r of tac.defsOf(o,i,code)) used.add(r);
      for(const r of tac.usesOf(o,i,code)) used.add(r);
    }
    let changed=false;
    for(const r of saved){
      if(used.has(r)) continue;            // 仍被使用 -> 必须保留保存
      code[1] &= ~((1<<r)<<8);            // 清 ENTER 高字节 mask
      for(const ins of instrs){ if(ins.op===O.LEAVE) code[ins.i+1] &= ~(1<<r); } // 清各 LEAVE 低字节 mask
      changed=true;
    }
    return changed;
  }

  // =====================================================================
  // F 层优化 pass: 全局 (跨基本块) 死代码消除 (global DCE)
  // ---------------------------------------------------------------------
  // 动机: 既有 _peepholeDCE 是"块内线性扫描", 在块边界保守地认为寄存器 live-in,
  //   因而漏掉大量"跨块也从未被使用"的死写 (死 MOVI/MOV/算术/LOAD). 这些死指令在
  //   定点迭代里始终残留, 最终翻译成 Thumb 即空转 MOV/算术. 本 pass 用与寄存器
  //   分配 (peepholeRegAlloc) 完全相同的全局活性分析 (c4_tac.tacAnalyze) 计算每条
  //   指令"之后"的活性, 删除所有 def 均已死的、且无副作用的指令.
  // 安全性:
  //   * 仅删除无副作用 opcode (MOV/MOVI/LDA/LEA/算术/LOAD/比较类; 不含 STORE/PUSH/
  //     POP/CALL/分支/LEAVE/ENTER/CMP 类 — CMP/CMPI 的 defsOf 为空, 本就跳过).
  //   * 不动 callee-saved (R4/R6/R7) 的定义: 其活性/ENTER-mask 交互由 _tacTrimCalleeMask
  //     单独处理, 避免误删导致 mask 与代码不一致; 函数出口补 {R0,R4,R6,R7} 活性,
  //     保证返回值与 callee 保存约定不被破坏.
  //   * 删除后走统一 _rebuild 做字级重映射 (labelTable/callFixups/funcAddrFixups/
  //     srcLineMap), 对 resolveLabels/finalizeLayout 透明. 与拷贝传播等构成定点迭代.
  //   * 用 C4_NO_GLOBALDCE=1 可关闭做对照. 仅在 _globalEnabled() (-O1+) 启用.
  // =====================================================================
  _tacGlobalDCE(seg){
    if(this.opts.noGlobalDCE) return 0;
    if(!this._globalEnabled()) return 0;
    const O=opcode, code=seg.code, n=code.length;
    if(!code || n<2 || code[0]!==O.ENTER) return 0;
    let ana=null;
    try{ ana=tac.tacAnalyze(code, seg.labelTable); }catch(e){ return 0; }
    if(!ana || !ana.cfg || !ana.cfg.blocks.length) return 0;
    const ins=ana.cfg.ins, blocks=ana.cfg.blocks;
    if(blocks.some(b=>b.startIns===undefined||b.endIns===undefined||b.endIns>=ins.length||b.endIns<b.startIns)) return 0;

    // --- 局部活性不动点 (带函数出口种子) ---------------------------------
    // 共享的 tac.computeLiveness 不给出口块播种 (其它 pass 依赖此行为), 这里
    // 自行迭代: 出口块 (无后继, 即 LEAVE/RET/VM_EXIT 结尾) liveOut 播种
    // {R0 返回值, R4/R6/R7 callee-saved}, 才能正确判定跨块死写.
    const EXIT_SEED=[0,4,6,7];
    // tac.usesOf 不建模调用参数寄存器 (TAC 的 CALL 不带实参个数), 只把 R0-R3 记作
    // def(杀伤). 若直接用它做活性, 调用点前的 `MOVI R0,imm` 实参装载会被误判为死写.
    // 这里保守地把 CALL/CALLR/SYS_CALL 视为使用全部潜在实参寄存器 R0-R3.
    const CALL_ARGS=[0,1,2,3];
    const usesX=(op,i)=>{
      const u=tac.usesOf(op,i,code);
      if(op===O.CALL||op===O.CALLR||op===O.SYS_CALL) return u.concat(CALL_ARGS);
      return u;
    };
    const liveIn=new Map(), liveOut=new Map();
    for(const b of blocks){ liveIn.set(b.id,new Set()); liveOut.set(b.id,new Set()); }
    for(let it=0, dirty=true; dirty && it<400; it++){
      dirty=false;
      for(let bi=blocks.length-1; bi>=0; bi--){
        const b=blocks[bi];
        const out=new Set();
        if(b.succ.size===0) for(const r of EXIT_SEED) out.add(r);
        for(const s of b.succ) for(const r of liveIn.get(s)) out.add(r);
        const live=new Set(out);
        for(let idx=b.endIns; idx>=b.startIns; idx--){
          const x=ins[idx];
          for(const d of tac.defsOf(x.op,x.i,code)) live.delete(d);
          for(const u of usesX(x.op,x.i)) live.add(u);
        }
        const ci=liveIn.get(b.id);
        let same=live.size===ci.size; if(same) for(const r of live) if(!ci.has(r)){same=false;break;}
        if(!same){ liveIn.set(b.id,live); dirty=true; }
        const co=liveOut.get(b.id);
        let osame=out.size===co.size; if(osame) for(const r of out) if(!co.has(r)){osame=false;break;}
        if(!osame){ liveOut.set(b.id,out); dirty=true; }
      }
    }
    // 每条指令的 live-after 集合
    const liveAfter=new Array(ins.length);
    for(const b of blocks){
      const live=new Set(liveOut.get(b.id));
      for(let idx=b.endIns; idx>=b.startIns; idx--){
        liveAfter[idx]=new Set(live);
        const x=ins[idx];
        for(const d of tac.defsOf(x.op,x.i,code)) live.delete(d);
        for(const u of usesX(x.op,x.i)) live.add(u);
      }
    }
    // 无副作用、可被删除的 opcode 集合
    const NOEFF=new Set([O.MOV,O.MOVI,O.LDA,O.LEA,
      O.ADD,O.SUB,O.MUL,O.DIV,O.MOD,O.AND,O.OR,O.XOR,O.SHL,O.SHR,O.BIC,
      O.ADDI,O.SUBI,O.MULI,O.DIVI,O.MODI,O.ANDI,O.ORI,O.XORI,O.SHLI,O.SHRI,
      O.LOAD,O.LOADB,O.LOADH,O.LOAD_OFF,O.LOADB_OFF,O.LOADH_OFF,
      O.EQ,O.NE,O.LT,O.GT,O.LE,O.GE]);
    // 禁止删除带有 funcAddrFixup 占位 (函数地址回填) 的指令: 删除会使 fixup
    // 落到别的指令字上, 破坏代码. funcAddrFixups 的 segIdx 即段在 funcSegments 的下标.
    const segIndex = this.funcSegments.indexOf(seg);
    const fixedWords=new Set();
    if(this.funcAddrFixups){
      for(const fx of this.funcAddrFixups){
        if(fx.segIdx!==segIndex) continue;
        const i2=fx.wordPos;
        for(const y of ins){ if(y.i<=i2 && i2<y.i+y.len) fixedWords.add(y.i); }
      }
    }
    const keep=new Array(ins.length).fill(true);
    let removed=0;
    for(let idx=0; idx<ins.length; idx++){
      if(liveAfter[idx]===undefined) continue;
      const x=ins[idx];
      if(!NOEFF.has(x.op)) continue;
      if(fixedWords.has(x.i)) continue;     // 携带 funcAddrFixup 的指令不删
      const defs=tac.defsOf(x.op,x.i,code);
      if(defs.length===0) continue;        // CMP/CMPI (defsOf 为空) 不删
      let ok=true;
      for(const d of defs){
        if(d===4||d===6||d===7) { ok=false; break; }   // 不动 callee-saved 定义
        if(liveAfter[idx].has(d)){ ok=false; break; }
      }
      if(ok){ keep[idx]=false; removed++;
        if(this.opts.debugDCE) console.error(`  DCE del [${seg.name}] op${x.op} @${x.i} (${code.slice(x.i,x.i+x.len).join(',')})`);
      }
    }
    if(removed===0) return 0;
    const instrs=ins.map(y=>({opc:y.op,i:y.i,len:y.len}));
    this._rebuild(seg, instrs, keep, new Array(ins.length).fill(null));
    return removed;
  }

  // =====================================================================
  // D 层优化 pass: 保守线性扫描寄存器分配 (栈槽 → 物理寄存器提升)
  // ---------------------------------------------------------------------
  // 架构约束:
  //   * 本 VM 的 TAC 已是物理寄存器形式 (acc=r0, tmp1=r1, tmp2=r2, tmp3=r3;
  //     局部标量经 allocCalleeReg 优先分配到 callee-saved r4/r6/r7).
  //   * 因此本 pass 不做 虚拟→物理 分配, 而是把"仍有大量 LOAD_OFF/STORE_OFF
  //     内存访问的栈槽"提升到富余的物理寄存器, 减少内存流量.
  // 安全规则 (保守):
  //   * 仅处理整字 LOAD_OFF/STORE_OFF 栈槽 (字节/半字槽跳过, 含截断/符号扩展);
  //   * 函数内若出现任意 计算地址访存 (LOAD/STORE/LOADB/STOREB/LOADH/STOREH)
  //     或 取地址 LEA rd==r0, 则整函数跳过 (避免别名误判);
  //   * 寄存器池: callee-saved 富余项 {r4,r6,r7} (跨 CALL 安全, 被调用方按约定保护;
  //     r7 曾因"被 CALLR 当函数指针暂存"被排除 —— 实测 M0 的 CALLR 只用 R0 作 scratch
  //     且 PUSH/POP 保护, 故 r7 可用. 但 promo.callee 必须包含 7, 否则 R7 被提升却不进
  //     ENTER/LEAVE mask → 序言不保存, 踩坏调用者的 R7 [铁律 7(a)]) +
  //     caller-saved {r1,r3} (仅用于"不含 CALL 的活区间", 且区间内不得作它用);
  //   * 线性扫描按 firstApp 排序, 同寄存器活区间不重叠才分配; caller 寄存器
  //     还要求区间内其操作数不被占用 (否则作它用会覆盖本地值);
  //   * 改写恒为 3字→3字: LOAD_OFF rd,off → MOV rd,reg ; STORE_OFF off,rs → MOV reg,rs;
  //   * 插入 入口加载 LOAD_OFF reg,off (紧接 ENTER) 与 出口写回 STORE_OFF off,reg
  //     (紧接该槽最后一次 STORE_OFF 之后, 保证重入时 home 正确); callee 提升需
  //     把对应位写入 ENTER 与每个 LEAVE 的 mask.
  // =====================================================================
  // D 层可用的高寄存器池 (caller-saved, ENTER/LEAVE 之外). 基础 VM 仅 R0-R7 → 空;
  // ThumbBackend (M0, R0-R12) 覆盖为 [8,9,10,11], 用于反 spill 低频长寿命栈槽到高寄存器.
  _highRegPool(){ return []; }

  peepholeRegAlloc(seg){
    const O=opcode, code=seg.code;
    if(!code || code.length<2 || code[0]!==O.ENTER) return false;
    // 1) 解码指令
    const instrs=[]; let i=0;
    while(i<code.length){ const opc=code[i], len=instrLen(opc); instrs.push({op:opc,i,len}); i+=len; }
    // 2) 安全闸门 / 别名分析
    //    保守模式 (默认): 任意计算地址访存 / 取地址 → 跳过整函数 (别名安全).
    //    ⑤ 全函数分配 (C4_FULLREG=1): 放宽别名闸门 —— 仅跳过"地址逃逸的槽"
    //      (被 LEA 取过地址的槽, 可能被指针偏移写命中邻槽); 其余槽照常提升.
    //      若既有计算地址写(STORE/STOREB/STOREH) 又有任一槽逃逸 → 保守整函数跳过
    //      (指针可能偏移命中邻槽, 不安全). 否则计算地址读 / 无逃逸取地址 均不阻断其它槽.
    //    注: 计算地址访存经指针/寄存器地址, 而标量槽地址仅由 LEA 形成 —— 故无 LEA 时
    //      无任何指针能指向该槽, 放宽后剩余槽提升是安全的 (残余跨过程指针参数别名由全回归门控).
    let hasComputedMem=false, hasComputedStore=false;
    const escapedSlots=new Set();
    for(const ins of instrs){
      const o=ins.op;
      if(o===O.LOAD||o===O.STORE||o===O.LOADB||o===O.STOREB||o===O.LOADH||o===O.STOREH){
        hasComputedMem=true;
        if(o===O.STORE||o===O.STOREB||o===O.STOREH) hasComputedStore=true;
      }
      if(o===O.LEA) escapedSlots.add(code[ins.i+2]); // LEA rd,off: 取槽 off 的地址 → 逃逸
    }
    const fullReg=!!this.opts.fullReg;
    // 调试打印须在闸门之前 — 否则被闸门拒绝的函数永远不出现在日志里, 无法定位"为何没提升".
    if(this.opts.fullRegDebug){ console.error(`[FR] seg#${seg.funcId} fullReg=${fullReg} hasCompMem=${hasComputedMem} hasCompStore=${hasComputedStore} escaped=${[...escapedSlots].join(',')}`); }
    if(!fullReg){ if(hasComputedMem||escapedSlots.size>0) return false; }
    else { if(hasComputedStore && escapedSlots.size>0) return false; }
    // 3) 收集栈槽 (整字 _OFF) — 注意 LOAD 类 off 在 ii+2, STORE 类 off 在 ii+1
    const slot=new Map();
    // 注意: 帧偏移对"局部变量"为负 (bp-16 起), 对"参数"为正 —— 故哨兵值绝不可用 -1/负数,
    //   否则局部变量槽会被整体误判为"非访存"而跳过 (历史 bug: D 层只提升过参数, 局部永远留栈).
    const offOf=(o,ii)=>{
      if(o===O.LOAD_OFF||o===O.LOADB_OFF||o===O.LOADH_OFF) return code[ii+2];
      if(o===O.STORE_OFF||o===O.STOREB_OFF||o===O.STOREH_OFF) return code[ii+1];
      return null;
    };
    for(const ins of instrs){
      const o=ins.op, ii=ins.i;
      if(o===O.LOAD_OFF||o===O.STORE_OFF||o===O.LOADB_OFF||o===O.STOREB_OFF||o===O.LOADH_OFF||o===O.STOREH_OFF){
        const off=offOf(o,ii);
        if(off===null) continue;
        let s=slot.get(off);
        if(!s){ s={off,firstApp:ii,lastApp:ii,byteHalf:false,lastWrite:-1,accessCount:0}; slot.set(off,s); }
        else { if(ii<s.firstApp)s.firstApp=ii; if(ii>s.lastApp)s.lastApp=ii; }
        if(o===O.LOADB_OFF||o===O.STOREB_OFF||o===O.LOADH_OFF||o===O.STOREH_OFF) s.byteHalf=true;
        if(o===O.STORE_OFF) s.lastWrite=ii;
        if(o===O.LOAD_OFF||o===O.STORE_OFF) s.accessCount++; // 仅整字槽参与频率门控
      }
    }
    const cands=[...slot.values()].filter(s=>!s.byteHalf && !escapedSlots.has(s.off)).sort((a,b)=>a.firstApp-b.firstApp);
    if(this.opts.fullRegDebug){ console.error(`[FR]   slots=${[...slot.keys()].join(',')||'(none)'} cands=${cands.map(s=>`off${s.off}(n=${s.accessCount})`).join(',')||'(none)'}`); }
    if(slot.size===0) return false;
    if(cands.length===0) return false;
    // 4) 活区间 / 寄存器占用 查询
    const hasCallInRange=(s)=>instrs.some(ins=>(ins.op===O.CALL||ins.op===O.CALLR||ins.op===O.SYS_CALL)&&ins.i>=s.firstApp&&ins.i<=s.lastApp);
    const regUsedInRange=(s,reg)=>instrs.some(ins=>{
      if(ins.i<s.firstApp||ins.i>s.lastApp) return false;
      const d=this._defOf(ins.op,ins.i,code); if(d===reg) return true;
      return this._useOf(ins.op,ins.i,code).includes(reg);
    });
    //    寄存器池: callee-saved 富余项 (未出现在 ENTER mask 中的 r4/r6/r7) + caller-saved {r1,r3}
    //    R7 同为 codegen 的局部变量寄存器 (R4/R6/R7), 未进 ENTER mask 即函数内无人使用 -> 可提升.
    //    (M0 后端虽用 R6/R7 做高寄存器中转, 但一律 PUSH/POP 成对保护, 不破坏被提升的值.)
    const calleeMask=(code[1]>>8)&0xFF;
    const calleePool=[];
    if(!(calleeMask&(1<<4))) calleePool.push(4);
    if(!(calleeMask&(1<<6))) calleePool.push(6);
    if(!(calleeMask&(1<<7))) calleePool.push(7);
    // caller-saved 池: R1/R3 两后端通用; 高寄存器 R8-R11 仅 M0/Thumb 后端有 (基础 VM 只有 R0-R7),
    // 经 _highRegPool() 后端特化 —— 基础 RegBackend 返回 [] (否则提升到不存在的 R8-R11 会写丢失/读垃圾).
    // ⑤ 全函数分配 (C4_FULLREG): 高寄存器提升需额外 PUSH/POP 保存恢复, 在寄存器压力高的函数里
    //   往往使代码体积净增长 (实测 t_hi.c M0 +112B). 故 C4_FULLREG 路径仅用低寄存器池 (r1/r3 + callee r4/r6),
    //   避免体积回归; 默认路径 (-O1+ 不含 C4_FULLREG) 行为不变, 仍可用高寄存器.
    const callerPool=[1,3].concat(fullReg ? [] : this._highRegPool());
    // 5) 分配: 全局开启 (-O1+) 用图着色 (干涉图 + 溢出决策); 否则保守线性扫描 (DISABLE_GLOBAL 回归对照)
    let promo;
    if(this._globalEnabled()){
      promo=this._gcAllocate(cands, calleePool, callerPool, hasCallInRange, regUsedInRange);
    }else{
      // 线性扫描: 按 firstApp 顺序贪心, 同寄存器活区间不重叠即分配 (历史保守路径)
      promo=[]; const assigned=[];
      for(const s of cands){
        const inCall=hasCallInRange(s);
        const regs = inCall ? calleePool.slice() : callerPool.concat(calleePool);
        for(const reg of regs){
          if(reg>7 && s.accessCount>6) continue; // 高寄存器中转昂贵, 仅低频长寿命槽使用 (高频槽让位给 R0-R7)
          if(assigned.some(a=>a.reg===reg && a.start<=s.lastApp && a.end>=s.firstApp)) continue; // 同寄存器活区间重叠
          if((reg===1||reg===3) && regUsedInRange(s,reg)) continue; // caller 寄存器被它用占用
          assigned.push({reg,start:s.firstApp,end:s.lastApp});
          promo.push({off:s.off,reg,callee:(reg===4||reg===6||reg===7),lastWrite:s.lastWrite,firstApp:s.firstApp});
          break;
        }
      }
    }
    if(promo.length===0) return false;
    if(this.opts.fullRegDebug){ console.error(`[FR]   -> PROMOTED seg#${seg.funcId}: ${promo.map(p=>`off${p.off}->R${p.reg}${p.callee?'(callee)':''}`).join(' ')}`); }
    // 6) 修补 ENTER / LEAVE mask (callee 提升)
    const calleeBits=promo.filter(p=>p.callee).reduce((m,p)=>m|(1<<p.reg),0);
    // 操作数编码不同 —— ENTER: sz|(mask<<8)|(isLeaf<<16); LEAVE: mask|(isLeaf<<8).
    // 故 LEAVE 的 mask 位在低字节, 绝不可跟 ENTER 一样左移 8 (历史 bug: 左移后 mask 落到
    // 空位, 序言 PUSH {R4,R6,R7} 而尾声只 POP {R4,R6} → SP 失衡 4 字节 + 调用者 R7 被踩).
    if(calleeBits){ code[1]|=calleeBits<<8; for(const ins of instrs){ if(ins.op===O.LEAVE) code[ins.i+1]|=calleeBits; } }
    // 7) 重建代码 + 字级重映射
    const remap=new Map();
    const hasColors=Array.isArray(seg.colors)||ArrayBuffer.isView(seg.colors);
    const fcol=(hasColors&&seg.colors&&seg.colors.length>1)?seg.colors[1]:0;
    const newCode=[]; const newColors=hasColors?[]:null;
    const emit=(w)=>{ newCode.push(w); if(newColors) newColors.push(fcol); };
    remap.set(0,newCode.length); emit(code[0]); remap.set(1,newCode.length); emit(code[1]); // ENTER
    // 入口加载放在槽的首次访问前 (而非函数入口), 使提升寄存器仅占用 [firstApp,lastApp],
    // 与 regUsedInRange 的干涉检查一致; 出口写回放在该槽最后一次写之后.
    const entryLoads=new Map();  // 原指令起始字 → [promo...]
    const exitSpills=new Map();  // 原 STORE_OFF 起始字 → [promo...]
    // 出口写回 (把提升寄存器的终值落回栈槽) 的唯一用途, 是让"计算地址读" (LOAD/LOADB/LOADH)
    // 仍能读到该槽的最新值. 而帧槽地址只可能由 LEA 产生 —— 全函数无 LEA (escapedSlots 空) 时
    // 不存在任何指向帧的指针, 计算地址访存必来自 LDA(全局数据段)/参数指针, 绝不会命中本帧槽,
    // 写回即纯粹冗余: 既浪费一条 STORE_OFF, 又(在 M0 负偏移帧寻址下)额外占用一个 scratch.
    // 故仅在有槽逃逸时才生成写回.
    const needExitSpill = escapedSlots.size>0;
    const _opcAt=(ii)=>{ const ins=instrs.find(x=>x.i===ii); return ins?ins.op:-1; };
    for(const p of promo){
      // 仅当首次访问是"读"(LOAD_OFF)才从栈载入: 值来自调用方写入的栈槽(栈传参)或前面已落栈的写.
      // 若首次访问是"写"(STORE_OFF), 值由随后的 STORE_OFF→MOV reg,rs 建立 —— 若仍插入入口加载,
      // 会读到该槽未初始化的值(典型为寄存器传参参数: 其 prologue STORE 被转换后栈槽再无写回,
      // 槽里是调用方遗留的垃圾), 且后续无 MOV 覆盖, 导致寄存器长期为脏值. 故省略入口加载.
      if(_opcAt(p.firstApp)===O.LOAD_OFF){
        if(!entryLoads.has(p.firstApp)) entryLoads.set(p.firstApp,[]);
        entryLoads.get(p.firstApp).push(p);
      }
      if(needExitSpill && p.lastWrite>=0){ if(!exitSpills.has(p.lastWrite)) exitSpills.set(p.lastWrite,[]); exitSpills.get(p.lastWrite).push(p); }
    }
    let ii=2;
    while(ii<code.length){
      if(entryLoads.has(ii)){ for(const p of entryLoads.get(ii)){ emit(O.LOAD_OFF); emit(p.reg); emit(p.off); } }
      const opc=code[ii], len=instrLen(opc);
      let words=null;
      if(opc===O.LOAD_OFF){ const rd=code[ii+1],off=code[ii+2]; const p=promo.find(q=>q.off===off); if(p) words=[O.MOV,rd,p.reg]; }
      else if(opc===O.STORE_OFF){ const off=code[ii+1],rs=code[ii+2]; const p=promo.find(q=>q.off===off); if(p) words=[O.MOV,p.reg,rs]; }
      if(!words) words=code.slice(ii,ii+len);
      for(let j=0;j<words.length;j++){ remap.set(ii+j,newCode.length); newCode.push(words[j]); if(newColors) newColors.push(fcol); }
      if(exitSpills.has(ii)){ for(const p of exitSpills.get(ii)){ emit(O.STORE_OFF); emit(p.off); emit(p.reg); } }
      ii+=len;
    }
    remap.set(code.length,newCode.length); // 段末哨兵
    if(seg.labelTable){ for(const k in seg.labelTable){ const nv=remap.get(seg.labelTable[k]); if(nv!==undefined) seg.labelTable[k]=nv; } }
    if(seg.callFixups){ for(const fx of seg.callFixups){ const nw=remap.get(fx.pos>>2); if(nw!==undefined) fx.pos=nw<<2; } }
    if(this.funcAddrFixups){ for(const fx of this.funcAddrFixups){ if(fx.segIdx===seg.funcId){ const nw=remap.get(fx.wordPos); if(nw!==undefined) fx.wordPos=nw; } } }
    if(this.srcLineMap) this._remapSrcLineMap(seg, remap);
    seg.code=newCode; if(newColors) seg.colors=newColors; seg.length=newCode.length*4;
    return true;
  }

  // =====================================================================
  // GRA: 图着色寄存器分配 (D 层 -O1+ 路径, 替代线性扫描)
  // ---------------------------------------------------------------------
  // 输入: 候选栈槽 cands (整字 _OFF, 已过别名闸门) + 寄存器池 + 干涉查询闭包.
  // 步骤:
  //   1) 每槽计算受限调色板 palette (随 inCall / accessCount / regUsedInRange 变化)
  //      与溢出收益 benefit=accessCount (高频槽收益高, 优先入寄存器).
  //   2) 构建干涉图: 两槽活区间 [firstApp,lastApp] 重叠即干涉 (同区间模型, 与线性扫描一致).
  //   3) Chow-Hennessy 优先级着色: 按 benefit 降序 (并列: 长活区间 > 高度数) 逐节点着色,
  //      从其 palette 中取一个未被"已着色干涉邻居"占用的寄存器; 取不到 → 溢出 (不提升).
  //      palette 顺序即偏好 (caller r1/r3 → 高寄存器 → callee r4/r6), 优先不需 mask 修补者.
  // 正确性: 干涉图保证同色两槽活区间不重叠; palette 保证每色对该槽都安全 —— 故任一合法着色
  //   都语义等价于原栈访问, 仅寄存器编号/内存流量不同. 相比线性扫描增益: 溢出按收益择优,
  //   高频槽不再被扫描序在前的低频槽抢占寄存器.
  // =====================================================================
  _gcAllocate(cands, calleePool, callerPool, hasCallInRange, regUsedInRange){
    // 1) 节点 + 受限调色板
    const nodes=[];
    for(const s of cands){
      const inCall=hasCallInRange(s);
      const base = inCall ? calleePool.slice() : callerPool.concat(calleePool);
      const palette=base.filter(reg=>{
        if(reg>7 && s.accessCount>6) return false;                  // 高寄存器仅低频长寿命槽
        if((reg===1||reg===3) && regUsedInRange(s,reg)) return false; // caller 寄存器被它用占用
        return true;
      });
      if(palette.length>0) nodes.push({s,palette,start:s.firstApp,end:s.lastApp,benefit:s.accessCount});
    }
    if(nodes.length===0) return [];
    // 2) 干涉图 (活区间重叠)
    const adj=nodes.map(()=>new Set());
    for(let a=0;a<nodes.length;a++) for(let b=a+1;b<nodes.length;b++){
      if(nodes[a].start<=nodes[b].end && nodes[b].start<=nodes[a].end){ adj[a].add(b); adj[b].add(a); }
    }
    // 3) 优先级着色
    const order=nodes.map((_,i)=>i).sort((x,y)=>{
      if(nodes[y].benefit!==nodes[x].benefit) return nodes[y].benefit-nodes[x].benefit; // 高频优先入寄存器
      const lx=nodes[x].end-nodes[x].start, ly=nodes[y].end-nodes[y].start;
      if(ly!==lx) return ly-lx;                                                          // 长活区间优先
      return adj[y].size-adj[x].size;                                                    // 高度数优先 (更难着色)
    });
    const colorOf=new Array(nodes.length).fill(-1);
    for(const i of order){
      const used=new Set();
      for(const j of adj[i]) if(colorOf[j]>=0) used.add(colorOf[j]);
      for(const reg of nodes[i].palette){ if(!used.has(reg)){ colorOf[i]=reg; break; } } // -1 = 溢出
    }
    // 4) 产出 promo[]
    const promo=[];
    for(let i=0;i<nodes.length;i++){
      if(colorOf[i]<0) continue;
      const s=nodes[i].s, reg=colorOf[i];
      promo.push({off:s.off,reg,callee:(reg===4||reg===6||reg===7),lastWrite:s.lastWrite,firstApp:s.firstApp});
    }
    return promo;
  }

  // =====================================================================
  // 全局优化 pass: 循环不变代码外提 (LICM)
  // ---------------------------------------------------------------------
  // 前提: 依赖 c4_tac 的 CFG / 支配树 / 自然循环 / 活性分析.
  // 把"循环不变"指令 (纯算术/MOV/MOVI/LEA/LDA/LOAD_OFF 等, 操作数均循环不变,
  // 且 def 不 live-in header、不在循环出口 live-out, 循环体无 CALL/RET/VB) 外提到
  // 循环 preheader (header 首条指令之前). 多轮迭代 (按依赖顺序) 以捕获链式不变式.
  // 安全规则:
  //   * 仅处理单个 def 寄存器的指令; 同一寄存器在循环内被多次定义 -> 跳过 (避免破坏顺序语义).
  //   * 含 CALL/CALLR/SYS_CALL/RET/VM_EXIT/VB 的循环整体跳过.
  //   * def 寄存器 live-in header -> 跳过 (preheader 覆盖会被提前使用, 破坏语义).
  //   * def 在循环出口 live-out -> 跳过 (避免 0 次迭代语义改变).
  //   * LOAD_OFF 仅当该 slot 在循环内无 STORE_OFF 且函数无计算地址访存时外提.
  //   * 严格 remap 契约 (labelTable/callFixups/funcAddrFixups/colors).
  // 由 _globalEnabled() 控制开关 (默认 ENABLE_GLOBAL 启用, 并入 -O1).
  // =====================================================================
  _globalEnabled(){
    // 全局优化 (LICM / GCSE / GRA / 内联) 并入 -O1..-O5; -O0 永不开.
    //   -O1/-O2/-O3: 默认 (保守内联).
    //   -O4 (最大速度): 激进内联 (多出口+溢出+大函数).
    //   -O5 (最小体积): 仅缩体 pass, 关闭内联.
    // 设 DISABLE_GLOBAL=1 可整体关闭 (用于回归对照).
    if(this.optLevel===0) return false;
    if(this.opts.disableGlobal) return false;
    return true;
  }

  // 在 seg 指定字索引前插入 insertWords, 并删除 deleteStarts 中的整条指令 (按起始字索引)
  _tacReconstruct(seg, opts){
    const code=seg.code, n=code.length;
    const del=opts.deleteSet||new Set();
    const insBefore=opts.insertBeforeWord;
    const insWords=opts.insertWords||[];
    const remap=new Map(); const newCode=[];
    const hasColors=Array.isArray(seg.colors)||ArrayBuffer.isView(seg.colors);
    const newColors=hasColors?[]:null;
    const licmColor=TAC_COLOR.make(TAC_COLOR.LICM_HOIST, seg.funcId);
    let i=0;
    while(i<n){
      if(i===insBefore){ for(const w of insWords){ newCode.push(w); if(newColors) newColors.push(licmColor); } }
      if(del.has(i)){
        const len=instrLen(code[i]);
        for(let j=0;j<len;j++) remap.set(i+j, newCode.length);
        i+=len; continue;
      }
      remap.set(i, newCode.length);
      newCode.push(code[i]);
      if(newColors) newColors.push(hasColors?(seg.colors[i]||0):0);
      i++;
    }
    remap.set(n, newCode.length); // 段末哨兵
    if(seg.labelTable){ for(const k in seg.labelTable){ const nv=remap.get(seg.labelTable[k]); if(nv!==undefined) seg.labelTable[k]=nv; } }
    if(seg.callFixups){ for(const fx of seg.callFixups){ const nw=remap.get(fx.pos>>2); if(nw!==undefined) fx.pos=nw<<2; } }
    if(this.funcAddrFixups){ for(const fx of this.funcAddrFixups){ if(fx.segIdx===seg.funcId){ const nw=remap.get(fx.wordPos); if(nw!==undefined) fx.wordPos=nw; } } }
    seg.code=newCode; if(newColors) seg.colors=newColors; seg.length=newCode.length*4;
  }

  // ⑤-B/C 专用重建: 同时在 preheader 插入 hoisted 字, 并把指定 LDA 指令原地替换为 MOV.
  //   - preheaderWords: 插入到 insertBeforeWord 之前的字序列
  //   - replaceMap: wordIdx -> [words], 把该字起始的整条指令替换为这些字 (长度可变); 同时 deleteSet 删除其后的配对 LOAD
  // 其余契约与 _tacReconstruct 完全一致 (labelTable/callFixups/funcAddrFixups/colors 重映射).
  _tacReconstructCache(seg, opts){
    const code=seg.code, n=code.length;
    const del=opts.deleteSet||new Set();
    const replaceMap=opts.replaceMap||new Map();
    const insBefore=opts.insertBeforeWord;
    const preWords=opts.preheaderWords||[];
    const remap=new Map(); const newCode=[];
    const hasColors=Array.isArray(seg.colors)||ArrayBuffer.isView(seg.colors);
    const newColors=hasColors?[]:null;
    const col=TAC_COLOR.make(TAC_COLOR.LICM_HOIST, seg.funcId);
    let i=0;
    while(i<n){
      if(i===insBefore){ for(const w of preWords){ newCode.push(w); if(newColors) newColors.push(col); } }
      if(del.has(i)){ const len=instrLen(code[i]); for(let j=0;j<len;j++) remap.set(i+j, newCode.length); i+=len; continue; }
      if(replaceMap.has(i)){
        const ws=replaceMap.get(i); const len=instrLen(code[i]);
        remap.set(i, newCode.length);
        for(const w of ws){ newCode.push(w); if(newColors) newColors.push(col); }
        for(let j=1;j<len;j++) remap.set(i+j, newCode.length);
        i+=len; continue;
      }
      remap.set(i, newCode.length);
      newCode.push(code[i]);
      if(newColors) newColors.push(hasColors?(seg.colors[i]||0):0);
      i++;
    }
    remap.set(n, newCode.length);
    if(seg.labelTable){ for(const k in seg.labelTable){ const nv=remap.get(seg.labelTable[k]); if(nv!==undefined) seg.labelTable[k]=nv; } }
    if(seg.callFixups){ for(const fx of seg.callFixups){ const nw=remap.get(fx.pos>>2); if(nw!==undefined) fx.pos=nw<<2; } }
    if(this.funcAddrFixups){ for(const fx of this.funcAddrFixups){ if(fx.segIdx===seg.funcId){ const nw=remap.get(fx.wordPos); if(nw!==undefined) fx.wordPos=nw; } } }
    if(this.srcLineMap) this._remapSrcLineMap(seg, remap);
    seg.code=newCode; if(newColors) seg.colors=newColors; seg.length=newCode.length*4;
  }
  // 同步 C→ASM 行号映射 (供 run_debug -m 对照表):
  //   peephole 重排 / 删除 / 替换 / 内联指令后, 按 remap 把本段 srcLineMap 的 key (emit 时地址)
  //   重定位到优化后地址. 关键点: srcLineMap 的 tacAddr 是"字节"偏移 (emit 的 here() 返回 *4),
  //   而 peephole 的 remap 以"字"偏移为 key —— 故此处统一在"字"域运算, 结果再 *4 回字节.
  //   仅保留"指令所有者"条目: 某新字位置 newW 的 owner = 映射到 newW 的"最小旧字偏移"(指令首字).
  //     被删指令虽也映射到后继幸存指令的 newW, 但其旧字偏移非最小 -> 非 owner -> 丢弃;
  //     否则其 stale 行号会覆盖后继幸存指令的正确条目, 造成 -m 行号错位 (行数偏差).
  //   注: 用"owner"而非"幸存集合"判定, 可正确处理"替换改变指令长度导致偏移不落在指令边界"的情形.
  _remapSrcLineMap(seg, remap){
    if(!this.srcLineMap) return;
    const prefix = seg.funcId + '_';
    const ownerOf = new Map();   // newW(字) -> 映射到该位置的"最小旧字偏移"(指令 owner)
    for(const [oldW, newW] of remap){
      const cur = ownerOf.get(newW);
      if(cur===undefined || oldW < cur) ownerOf.set(newW, oldW);
    }
    const rebuilt = {};
    for(const k in this.srcLineMap){
      if(k.indexOf(prefix)!==0) continue;            // 仅处理本段条目
      const e = this.srcLineMap[k];
      const oldW = e.tacAddr >> 2;                    // 字节偏移 -> 字偏移
      const newW = remap.get(oldW);
      if(newW===undefined) continue;
      if(ownerOf.get(newW) !== oldW) continue;        // 非 owner (被删指令): 丢弃
      const nt = newW << 2;                           // 字偏移 -> 字节偏移
      rebuilt[prefix + nt] = { line: e.line, tacAddr: nt };
    }
    for(const k in this.srcLineMap){ if(k.indexOf(prefix)===0) delete this.srcLineMap[k]; }
    for(const k in rebuilt) this.srcLineMap[k] = rebuilt[k];
  }

  // ⑤-B/C: 循环不变"全局基址"缓存 (loop-invariant base caching)
  //   把循环内重复出现的 "LDA rd,off; LOAD rd,0" (加载全局变量/常量指针值) 外提至 preheader,
  //   锁进一个 callee/caller 空闲寄存器 (cache), 循环体内改为 "MOV rd,cache". 消除每轮重载.
  //   安全闸门 (全部满足才外提):
  //     - 循环无屏障(调用/返回/VB)  (否则别名/活性不可控)
  //     - 全局 off 在循环内绝不被写: 用 mayHold 前向数据流追踪 "可能持有裸地址 off 的寄存器",
  //        任意 STORE*/STOREB*/STOREH* 的地址寄存器若落在 mayHold 中 -> off 可能被写 -> 跳过.
  //        (LDA r,off 使 r 进入 mayHold; LOAD r,* 使 r 退出 mayHold(变为 *(off) 而非 off);
  //         MOV rk,rx 若 rx 在 mayHold 则 rk 进入; STORE addr,* 若 addr 在 mayHold 则 off 被写)
  //     - 同一 off 在循环内出现 >=2 次 (净收益)
  //     - 存在一个整个函数未被任何 def/use 引用的空闲寄存器作 cache
  //   门控: -O1+ (_globalEnabled) 默认启用; C4_NO_CACHEBASE=1 可关闭 (排障用).
  _tacCacheLoopBase(seg){
    const O=opcode;
    if(!this._globalEnabled()) return false;
    if(this.opts.noCacheBase) return false;
    if(!seg.code || seg.code.length<2 || seg.code[0]!==O.ENTER) return false;
    const a=tac.tacAnalyze(seg.code, seg.labelTable);
    const code=seg.code, ins=a.cfg.ins;
    // 1) 函数级被引用寄存器集合 (用于选空闲 cache 寄存器)
    const usedRegs=new Set();
    for(let i=0;i<code.length;){ const opc=code[i], len=instrLen(opc);
      for(const r of tac.defsOf(opc,i,code)) usedRegs.add(r);
      for(const r of tac.usesOf(opc,i,code)) usedRegs.add(r);
      i+=len;
    }
    // 1b) 函数级"循环体用到的寄存器" (用于 Tier-2 借用选择): 初始为空, 在循环处理内按 loopIdxs 填充.
    //     pickCache 放宽:
    //       Tier-1 (原): 整个函数未用过的寄存器 (callee/caller 池) -> 直接作 cache, 无需保护.
    //       Tier-2 (新): 循环体内未用到、且循环出口之后程序序不再被引用的寄存器 ->
    //         借来作 cache (preheader 载入 pa 后循环体内不会再被用, 出口后又不再读 -> 借用在
    //         任何路径上都安全, 无需 PUSH/POP 保护, 不触碰栈帧). 这把 ⑤-B/C 覆盖从
    //         "整函数完全空闲寄存器" 放宽到 "循环体内空闲且循环后死亡寄存器", 在寄存器
    //         饱和的热循环(如 spirw)之外的大量函数上可命中.
    // 2) 逐自然循环处理
    for(const lp of a.loops){
      if(a.cfg.blocks[lp.header].startIns===0) continue; // header 不能是入口块
      // 屏障循环整体跳过
      let barrier=false;
      for(const bid of lp.body){ const blk=a.cfg.blocks[bid];
        for(let idx=blk.startIns; idx<=blk.endIns; idx++){ if(tac.isBarrier(ins[idx].op)){ barrier=true; break; } }
        if(barrier) break;
      }
      if(barrier) continue;
      // preheader 计算 (同 _tacLICM)
      const hPreds=[...a.cfg.blocks[lp.header].pred].filter(bid=>!lp.body.has(bid));
      if(hPreds.length!==1) continue;
      const preId=hPreds[0];
      if(a.loops.some(l=>l!==lp && l.body.has(preId))) continue;
      const preBlk=a.cfg.blocks[preId];
      const lastIns=ins[preBlk.endIns];
      const headerWord=ins[a.cfg.blocks[lp.header].startIns].i;
      const headerLabels=[]; for(const k in seg.labelTable) if(seg.labelTable[k]===headerWord) headerLabels.push(+k);
      if(headerLabels.length===0) continue;
      const isTerm=tac.isTerminator(lastIns.op);
      const insertBeforeWord=isTerm ? lastIns.i : (lastIns.i+lastIns.len);
      // 3) 收集循环内指令 (程序序)
      const loopIdxs=[];
      for(const bid of lp.body){ const blk=a.cfg.blocks[bid]; for(let idx=blk.startIns; idx<=blk.endIns; idx++) loopIdxs.push(idx); }
      loopIdxs.sort((p,q)=>ins[p].i-ins[q].i);
      // 3b) 循环体用到的寄存器 与 循环出口之后程序序仍被引用的寄存器 (供 Tier-2 借用判定)
      const loopUsed=new Set();
      for(const idx of loopIdxs){ for(const r of tac.defsOf(ins[idx].op,ins[idx].i,code)) loopUsed.add(r); for(const r of tac.usesOf(ins[idx].op,ins[idx].i,code)) loopUsed.add(r); }
      const maxLoopWord=loopIdxs.reduce((m,idx)=>Math.max(m,ins[idx].i),0);
      const postLoopUsed=new Set();
      for(let i=maxLoopWord+1;i<code.length;){ const opc=code[i], len=instrLen(opc);
        for(const r of tac.defsOf(opc,i,code)) postLoopUsed.add(r);
        for(const r of tac.usesOf(opc,i,code)) postLoopUsed.add(r);
        i+=len; }
      // 别名安全: 收集 "被 LDA 直接定义、可能持有裸地址 off 的寄存器" (ldaDestByOff),
      //   再判循环内是否有 STORE* 以这些寄存器为地址 -> 该 off 可能被写 -> 不可外提.
      const ldaDestByOff=new Map(); // off -> Set(regs)
      const offWritten=new Set();
      for(const idx of loopIdxs){
        const x=ins[idx], op=x.op, i=x.i;
        if(op===O.LDA){ const rd=code[i+1], off=code[i+2];
          if(!ldaDestByOff.has(off)) ldaDestByOff.set(off,new Set()); ldaDestByOff.get(off).add(rd); }
        else if(op===O.STORE||op===O.STOREB||op===O.STOREH){
          const addr=code[i+1];
          for(const [off,regs] of ldaDestByOff){ if(regs.has(addr)) offWritten.add(off); }
        } else if(op===O.STORE_OFF||op===O.STOREB_OFF||op===O.STOREH_OFF){ offWritten.add(code[i+1]); }
      }
      // ---- 模式 A (优先): 整条"循环不变槽初始化链"外提 ----
      //   形如   LDA rd,off ; LOAD rd,0 ; STORE_OFF s,rd     (即 C 源的 `p = g;`, g 为全局指针)
      //   若 (a) 全局 off 在循环内不被写 (offWritten 判定);
      //      (b) 槽 s 在循环内只有这一处写;
      //      (c) 槽 s 在整个函数内从未被 LEA 取地址 (无指针可旁路写它);
      //      (d) 槽 s 在循环之外没有任何 LOAD_OFF/STORE_OFF (循环外死 → preheader 提前写入无副作用,
      //          这也顺带解决了 0 次迭代时"多执行一次赋值"的语义问题);
      //   则把三条整体搬到 preheader. 相比模式 B, 它在循环体内不占用任何寄存器
      //   (rd 只在 preheader 短暂使用), 因此不与后续 D 段栈槽提升争寄存器 ——
      //   槽 s 随后仍可被 peepholeRegAlloc 提升到 callee-saved, 循环体内退化为纯寄存器读.
      {
        const escapedAll=new Set();
        for(let i=0;i<code.length;){ const opc=code[i]; if(opc===O.LEA) escapedAll.add(code[i+2]); i+=instrLen(opc); }
        const loopWordSet=new Set(loopIdxs.map(idx=>ins[idx].i));
        // 槽访问统计: 循环内写次数 / 循环外访问次数
        const slotWrInLoop=new Map(), slotOutside=new Map();
        const bump=(m,k)=>m.set(k,(m.get(k)||0)+1);
        for(let i=0;i<code.length;){
          const opc=code[i]; const inLoop=loopWordSet.has(i);
          if(opc===O.STORE_OFF||opc===O.STOREB_OFF||opc===O.STOREH_OFF){
            if(inLoop) bump(slotWrInLoop,code[i+1]); else bump(slotOutside,code[i+1]);
          } else if(opc===O.LOAD_OFF||opc===O.LOADB_OFF||opc===O.LOADH_OFF){
            if(!inLoop) bump(slotOutside,code[i+2]);
          }
          i+=instrLen(opc);
        }
        for(let k=0;k<loopIdxs.length-2;k++){
          const a1=ins[loopIdxs[k]], a2=ins[loopIdxs[k+1]], a3=ins[loopIdxs[k+2]];
          if(a2.i!==a1.i+a1.len || a3.i!==a2.i+a2.len) continue;      // 必须代码相邻
          if(a1.op!==O.LDA || a2.op!==O.LOAD || a3.op!==O.STORE_OFF) continue;
          const rd=code[a1.i+1], off=code[a1.i+2];
          if(code[a2.i+1]!==rd || code[a2.i+2]!==0) continue;          // LOAD rd,0 (自解引用)
          if(code[a3.i+2]!==rd) continue;                              // STORE_OFF s,rd
          const s=code[a3.i+1];
          if(offWritten.has(off)) continue;                            // (a)
          if((slotWrInLoop.get(s)||0)!==1) continue;                   // (b)
          if(escapedAll.has(s)) continue;                              // (c)
          if((slotOutside.get(s)||0)!==0) continue;                    // (d)
          const preheaderWords=[O.LDA,rd,off, O.LOAD,rd,0, O.STORE_OFF,s,rd];
          const deleteSet=new Set([a1.i,a2.i,a3.i]);
          this._tacReconstructCache(seg, { insertBeforeWord, preheaderWords, replaceMap:new Map(), deleteSet });
          if(this.opts.fullRegDebug){ console.error(`[CB] seg#${seg.funcId} hoist-chain off=${off} -> slot${s} (preheader@${insertBeforeWord})`); }
          return true;
        }
      }
      // ---- 模式 B: 检测相邻 "LDA rd,off; LOAD rd,0" 对, 按 off 分组 (缓存进空闲寄存器) ----
      const occByOff=new Map(); // off -> [LDA 字索引...]
      for(let k=0;k<loopIdxs.length-1;k++){
        const cur=ins[loopIdxs[k]], nxt=ins[loopIdxs[k+1]];
        if(nxt.i!==cur.i+cur.len) continue; // 代码相邻 (同块或跨块顺序落入)
        if(cur.op!==O.LDA || nxt.op!==O.LOAD) continue;
        const rdC=code[cur.i+1], off=code[cur.i+2];
        const rdN=code[nxt.i+1], rsN=code[nxt.i+2];
        if(rdC!==rdN || rsN!==0) continue; // LOAD rd,0 (自解引用)
        if(!occByOff.has(off)) occByOff.set(off,[]);
        occByOff.get(off).push(cur.i); // 记录 LDA 字索引
      }
      // 4) 选取最佳 off (出现次数最多) 且 off 未被写 且 有足够空闲 cache 寄存器
      const cand=[...occByOff.entries()].filter(([off])=>!offWritten.has(off) && occByOff.get(off).length>=2)
        .sort((a,b)=>b[1].length-a[1].length);
      if(cand.length===0) continue;
      // 选 cache 寄存器:
      //   Tier-1: 整个函数未用过 (usedRegs 不含) -> 安全, 无需保护.
      //   Tier-2: 循环体内未用到(loopUsed 不含) 且 循环出口之后程序序不再被引用(postLoopUsed 不含)
      //           -> 借来作 cache 安全 (循环体内不会被覆盖/读取, 出口后又无人用, 无需 PUSH/POP 触碰栈帧).
      let cache=-1, promoteR7=false;
      // callee-saved (R4/R6) 仅当已在 ENTER mask 中 (序言已保存) 才可挪用, 否则会踩坏调用者
      const cbEnterMask=(code[1]>>8)&0xFF;
      const cbSafe=(r)=> (r!==4 && r!==6 && r!==7) || !!(cbEnterMask&(1<<r));
      for(const r of [4,6,1,2,3]){ if(!cbSafe(r)) continue; if(!usedRegs.has(r)){ cache=r; break; } }      // Tier-1
      if(cache<0) for(const r of [4,6,1,2,3]){ if(!cbSafe(r)) continue; if(!loopUsed.has(r) && !postLoopUsed.has(r)){ cache=r; break; } } // Tier-2
      // Tier-3: R7 整函数空闲 -> 提升进 ENTER/LEAVE callee mask 后借用 (R7 为 callee-saved, 序言/尾声自动保存恢复)
      if(cache<0 && !usedRegs.has(7)){ cache=7; promoteR7=!(cbEnterMask&0x80); }
      if(cache<0) continue; // 无可用寄存器 -> 跳过 (保守)
      const [off, ldaWords]=cand[0];
      // 5) 构造替换: preheader 插入 "LDA cache,off; LOAD cache,[cache]" (自解引用, 不得依赖 R0!);
      //    循环内每个 LDA 替换为 "MOV rd,cache"
      const preheaderWords=[O.LDA, cache, off, O.LOAD, cache, cache];
      const replaceMap=new Map(); const deleteSet=new Set();
      for(const lw of ldaWords){
        const rd=code[lw+1];
        replaceMap.set(lw, [O.MOV, rd, cache]);   // LDA rd,off -> MOV rd,cache (3字->3字)
        const loadW=lw+instrLen(O.LDA);            // 紧随的 LOAD
        deleteSet.add(loadW);
      }
      this._tacReconstructCache(seg, { insertBeforeWord, preheaderWords, replaceMap, deleteSet });
      if(promoteR7){ // R7 借用: 提升 ENTER mask + 每个 LEAVE mask (0x80), 序言/尾声自动 PUSH/POP
        const nc=seg.code; nc[1]|=0x80<<8;
        for(let i=0;i<nc.length;){ const opc=nc[i]; if(opc===O.LEAVE) nc[i+1]|=0x80; i+=instrLen(opc); }
      }
      if(this.opts.fullRegDebug){ console.error(`[CB] seg#${seg.funcId} hoist off=${off} x${ldaWords.length} -> R${cache} (preheader@${insertBeforeWord})`); }
      return true; // 已改动, 交由定点迭代重分析 (下一轮可能外提第二个 off)
    }
    return false;
  }

  // =====================================================================
  // P1: 函数级常量 / 地址提升 (function-level constant hoisting)
  // ---------------------------------------------------------------------
  // 目标: 把函数内反复出现的 "LDA rd,off" (全局/常量地址) 或 "MOVI rd,val"
  //   (立即数) 在函数入口物化进一个专用寄存器 cache, 后续出现改写为
  //   "MOV rd,cache". Thumb 层 LDA/MOVI=4B 变为 MOV=2B, 缩体.
  //   与 _tacCacheLoopBase (仅循环内) 互补: 此处覆盖函数级 / 直线代码,
  //   可命中跨多个循环 / 非循环重复 (如 main 中 MOVI 0x1388×6).
  //
  // 寄存器安全:
  //   * Tier-1: 选整个函数未用过的寄存器, 零成本、无需保护.
  //       - caller 寄存器 (R1/R2/R3) 仅当函数无 CALL 时可用 (CALL 踩 R0-R3).
  //       - callee 寄存器 (R4/R6/R7) 未用过即安全.
  //   * Tier-3: 当 freq>=4 时 promote 一个未用过的 callee 寄存器进
  //       ENTER/LEAVE 掩码 (借 _tacCacheLoopBase 的 promoteR7 先例),
  //       成本 PUSH/POP(4B), freq>=4 时净收益>=2B 安全为正.
  //   * 排除 R5(BP); 排除作为函数指针占位 (funcAddrFixups) 的 MOVI.
  // 门控: _globalEnabled() (并入 -O1..-O5); C4_NO_FUNCHOIST 可关闭.
  // =====================================================================
  _tacFuncHoistConst(seg){
    const O=opcode;
    if(!this._globalEnabled()) return false;
    if(this.opts.noFuncHoist) return false;
    if(!seg.code || seg.code.length<2 || seg.code[0]!==O.ENTER) return false;
    const code=seg.code;
    // 函数指针 MOVI 占位 (会被 funcAddrFixups 改写), 不可外提
    const fixupWords=new Set();
    if(this.funcAddrFixups) for(const fx of this.funcAddrFixups){
      if(fx.segIdx===seg.funcId) fixupWords.add(fx.wordPos);
    }
    // 函数级被引用寄存器 + 是否有 CALL
    const usedRegs=new Set(); let hasCall=false;
    for(let i=0;i<code.length;){ const opc=code[i], len=instrLen(opc);
      for(const r of tac.defsOf(opc,i,code)) usedRegs.add(r);
      for(const r of tac.usesOf(opc,i,code)) usedRegs.add(r);
      if(opc===O.CALL||opc===O.CALLR||opc===O.SYS_CALL) hasCall=true;
      i+=len;
    }
    // 收集候选: LDA off / MOVI val, freq>=2
    const ldaByOff=new Map(); const moviByVal=new Map();
    for(let i=0;i<code.length;){ const opc=code[i], len=instrLen(opc);
      if(opc===O.LDA){ const off=code[i+2]; if(!ldaByOff.has(off)) ldaByOff.set(off,[]); ldaByOff.get(off).push(i); }
      else if(opc===O.MOVI){ if(!fixupWords.has(i)){ const v=code[i+2]; if(!moviByVal.has(v)) moviByVal.set(v,[]); moviByVal.get(v).push(i); } }
      i+=len;
    }
    const cands=[];
    for(const [off,ws] of ldaByOff) if(ws.length>=2) cands.push({type:'LDA',val:off,ws,freq:ws.length});
    for(const [v,ws] of moviByVal) if(ws.length>=2 && v!==0) cands.push({type:'MOVI',val:v,ws,freq:ws.length});
    cands.sort((x,y)=>y.freq-x.freq);
    // 逐候选尝试 (定点迭代会再处理第二个常量)
    for(const c of cands){
      const remaining=c.ws.filter(w=> code[w]===(c.type==='LDA'?O.LDA:O.MOVI));
      if(remaining.length<2) continue;
      let cache=-1, promote=0;
      // Tier-1: 空闲 caller 寄存器 (函数无 CALL 时安全)
      if(!hasCall){ for(const r of [3,2,1]){ if(!usedRegs.has(r)){ cache=r; promote=0; break; } } }
      // Tier-3: 空闲 callee 寄存器, promote (freq>=4 才划算)
      if(cache<0 && remaining.length>=4){ for(const r of [6,4,7]){ if(!usedRegs.has(r)){ cache=r; promote=r; break; } } }
      if(cache<0) continue;
      const preWords = c.type==='LDA' ? [O.LDA, cache, c.val] : [O.MOVI, cache, c.val];
      const replaceMap=new Map();
      for(const w of remaining){ const rd=code[w+1]; replaceMap.set(w, [O.MOV, rd, cache]); }
      const insertBeforeWord=2; // ENTER 占 2 字, 入口紧随其后
      this._tacReconstructCache(seg, { insertBeforeWord, preheaderWords:preWords, replaceMap, deleteSet:new Set() });
      if(promote>0){
        const nc=seg.code; nc[1]|=(1<<(promote+8));
        for(let i=0;i<nc.length;){ const opc=nc[i]; if(opc===O.LEAVE) nc[i+1]|=(1<<promote); i+=instrLen(opc); }
      }
      if(this.opts.fullRegDebug) console.error(`[CB] funcHoist seg#${seg.funcId} ${c.type} 0x${c.val.toString(16)} x${remaining.length} -> R${cache}`);
      return true;
    }
    return false;
  }

  // =====================================================================
  // P3: 全局地址冗余加载 / 死存储消除 (redundant load / store elimination)
  // ---------------------------------------------------------------------
  // 针对寄存器寻址的 STORE/LOAD (全局/指针访问). 借助"地址稳定寄存器"追踪:
  //   某寄存器 r 若其值为恒定地址 (来自 LDA off 或 MOV r, 地址稳定寄存器),
  //   则记录 addrNow[r] = 地址标识 id ('L'+off). 维护 avail[id]=最近写入该
  //   地址的"值寄存器", 在 (1) 值寄存器未被重定义、(2) 无 CALL/LEA/VB 屏障
  //   的前提下, 后续 LOAD r,a 可改为 MOV r, avail[id] (r===valReg 时删除 LOAD).
  //   这消除了如 spirw 中连续 *pa 读-改-写间的重复 LOAD (转发为寄存器搬移).
  //
  // 别名安全: 任何 STORE 只更新自身 id 的 avail, 并清掉其它 id (保守防别名);
  //   任何 CALL/LEA/VB 清掉全部 avail. 地址寄存器被重定义到其它 id 时自动切换.
  //
  // 死存储消除: 同基本块内 "STORE a,v1 ... STORE a,v2" 且两写之间无对 a 的
  //   LOAD 读取, 且 v1 在首写之后即死 (不 live-out, 块内无后续使用) -> 删首写.
  // 门控: _globalEnabled(); C4_NO_GLOBALRLE 可关闭.
  // =====================================================================
  _tacGlobalRLE(seg){
    const O=opcode;
    if(!this._globalEnabled()) return false;
    if(this.opts.noGlobalRLE) return false;
    if(!seg.code || seg.code.length<2 || seg.code[0]!==O.ENTER) return false;
    const a=tac.tacAnalyze(seg.code, seg.labelTable);
    const code=seg.code, ins=a.cfg.ins;
    const isAddrSet=(op,i)=>{
      if(op===O.LDA) return {r:code[i+1], id:'L'+code[i+2]};
      if(op===O.MOV){ const d=code[i+1], s=code[i+2]; if(d!==s && addrNow[s]!==undefined) return {r:d, id:addrNow[s]}; }
      return null;
    };
    const addrNow=new Array(16).fill(undefined);
    const avail=new Map();          // id -> 值寄存器
    const liveVal=new Set();        // 仍持有 avail 值的寄存器
    const delSet=new Set();
    const replMap=new Map();
    let changed=false;
    // 块级 liveBefore (供死存储判定)
    const liveBefore=new Array(ins.length);
    for(const blk of a.cfg.blocks){
      let live=new Set(a.liveness.liveOutBlock.get(blk.id)||[]);
      for(let j=blk.endIns; j>=blk.startIns; j--){
        const x=ins[j], op=x.op;
        let uses=tac.usesOf(op,x.i,code), defs=tac.defsOf(op,x.i,code);
        if(op===O.CALL||op===O.CALLR) uses=uses.concat([0,1,2,3]);
        if(op===O.LEAVE||op===O.RET||op===O.VM_EXIT) uses=uses.concat(0);
        const lb=new Set(live);
        for(const d of defs) lb.delete(d);
        for(const u of uses) lb.add(u);
        liveBefore[j]=lb; live=lb;
      }
    }
    const labelPos=new Set();
    if(seg.labelTable) for(const k in seg.labelTable) labelPos.add(seg.labelTable[k]);
    // 死存储跟踪 (按基本块重置)
    let lastStoreId=null, lastStoreIdx=-1, lastStoreVal=-1, readSince=false, curBlock=-1;
    const resetDeadStore=()=>{ lastStoreId=null; lastStoreIdx=-1; lastStoreVal=-1; readSince=false; };
    for(let idx=0; idx<ins.length; idx++){
      const x=ins[idx], op=x.op, i=x.i;
      // 块切换: 重置 avail / liveVal / 死存储跟踪 (跨块转发不安全)
      const bOf = a.cfg.blockOfWord(i);
      if(bOf!==curBlock){ curBlock=bOf; avail.clear(); liveVal.clear(); resetDeadStore(); }
      // 地址标识更新 (先清被本指令重定义的, 再设本指令建立的)
      const defs=tac.defsOf(op,i,code);
      if(!(op===O.STORE||op===O.STOREB||op===O.STOREH)){
        for(const r of defs){ if(r>=0&&r<16){ addrNow[r]=undefined; liveVal.delete(r); } }
      }
      const aSet=isAddrSet(op,i);
      if(aSet) addrNow[aSet.r]=aSet.id;
      // 屏障: 清掉全部 avail (保守防别名)
      if(op===O.CALL||op===O.CALLR||op===O.SYS_CALL||op===O.LEA||op===O.VB){ avail.clear(); liveVal.clear(); continue; }
      // STORE: 死存储消除 + avail 更新
      if(op===O.STORE||op===O.STOREB||op===O.STOREH){
        const ar=code[i+1], vr=code[i+2]; const id=addrNow[ar];
        if(id!==undefined && id===lastStoreId && !readSince){
          // 首写值寄存器在首写之后即死 (且首写非跳转目标) -> 删首写 (内存未被其间读取)
          const lbNext = (lastStoreIdx+1<ins.length) ? liveBefore[lastStoreIdx+1] : null;
          if(lbNext && !lbNext.has(lastStoreVal) && !labelPos.has(ins[lastStoreIdx].i)){
            delSet.add(ins[lastStoreIdx].i); changed=true;
          }
        }
        // 更新 avail (清其它 id, 防别名), 设本 id
        if(id!==undefined){
          for(const key of [...avail.keys()]) if(key!==id) avail.delete(key);
          avail.set(id, vr); liveVal.add(vr);
        }
        lastStoreId=id; lastStoreIdx=idx; lastStoreVal=vr; readSince=false;
        continue;
      }
      // LOAD: 冗余加载转发
      if(op===O.LOAD||op===O.LOADB||op===O.LOADH){
        const rd=code[i+1], ar=code[i+2]; const id=addrNow[ar];
        if(id!==undefined && id===lastStoreId) readSince=true; // 本地址被读 -> 阻止死存储消除
        if(id!==undefined && avail.has(id)){
          const vr=avail.get(id);
          if(liveVal.has(vr) && rd!==ar){
            if(rd===vr){ if(!labelPos.has(i)){ delSet.add(i); changed=true; } }
            else { replMap.set(i, [O.MOV, rd, vr]); changed=true; }
            liveVal.add(rd);
          }
        }
        continue;
      }
    }
    if(!changed) return false;
    this._tacReconstructCache(seg, { deleteSet:delSet, replaceMap:replMap });
    return true;
  }

  // =====================================================================
  // Pass 5 常量跨块复用 (方案 B + 方案 C)  — 循环不变常量外提/物化
  // ---------------------------------------------------------------------
  // 目标: 让循环内"每轮重复加载同一常量"的冗余只发生一次, 缩小 Thumb-1 体积.
  //   Thumb-1 无立即数 ORR/BIC/AND/XOR (16-bit), 故 `*pa|=0x10` 之类被 codegen 展开为
  //   `MOV Rk,#imm; ORR Rd,Rk` —— 该 `MOV #imm` 每轮重加载. TAC 层这些常量以
  //   "ALU 立即数指令" (ORI/BICI/ANDI/XORI rd,rs,#imm) 形式存在, 本 pass 把其物化为:
  //     预header: MOVI Rc,#imm        (仅一次)
  //     循环内:   OR/BIC/AND/XOR rd,rs,Rc   (寄存器形式, 复用 Rc)
  //   等价且消除了每轮 `MOV #imm` 重加载.
  //
  // 两类机会:
  //   Type B (主, 直接命中 spirw 掩码): 循环内 ORI/XORI/ANDI rd,rs,#imm 且 imm∈[0,255]
  //     → 物化为 preheader MOVI Rc,#imm + 改写为寄存器形式. 同 imm 跨出现共享同一 Rc.
  //   Type A (方案C 安全子集): 循环内 MOVI Rd,#imm 多定义但"全部同值" (LICM 因单定义
  //     限制整体跳过) → 外提一个到 preheader, 删除其余 (全是同一常量, 删除安全).
  //
  // 寄存器选择 (同 ⑤-B/C): Tier-1 整个函数未用 → 安全; Tier-2 循环体内未用且循环出口后
  //   不再被引用 → 借作常量缓存 (preheader 设置后循环内不会被覆盖/读取, 出口后又无人用).
  // 门控: _globalEnabled() (并入 -O1..-O5, -O0 永不开). 重用 _tacReconstructCache 的
  //   preheaderWords + replaceMap + deleteSet + remap 契约.
  // =====================================================================
  // TAC 死移动消除 (无标志位副作用, 安全):
  //   删除 `MOV Rd, Rs` 当 Rd 在所属基本块内, 从本定义到下一次定义之间无任何使用
  //   (且非块 live-out) —— 即该写是死写. 典型收益: RMW 宏在"基址已在寄存器"时生成的
  //   `MOV Rk, Rbase` 经拷贝传播后变死, 删除它可释放 Rk, 供 _tacHoistImm 物化循环常量.
  //   基于既有块级活性 (a.liveness), 与 DCE/CSE 同级别 (无条件运行, 语义保持).
  _tacElimDeadMove(seg){
    const O=opcode;
    if(!seg.code || seg.code.length<2 || seg.code[0]!==O.ENTER) return false;
    const a=tac.tacAnalyze(seg.code, seg.labelTable);
    const code=seg.code, ins=a.cfg.ins;
    // 全局每指令活性 (liveBefore[j] = 紧邻指令 j 之前的 live 集合).
    // 由块级 liveOut 反向遍历得到, 正确处理跨块使用与循环携带值.
    // 关键: LEAVE/RET/VM_EXIT 消费 R0 (返回值) — 显式补入 uses, 否则会误删返回前的 MOV R0,x.
    const liveBefore=new Array(ins.length);
    for(const blk of a.cfg.blocks){
      let live=new Set(a.liveness.liveOutBlock.get(blk.id)||[]);
      for(let j=blk.endIns; j>=blk.startIns; j--){
        const x=ins[j], op=x.op;
        let uses=tac.usesOf(op, x.i, code), defs=tac.defsOf(op, x.i, code);
        // 调用读取参数寄存器 R0..R3 (usesOf 未建模, 否则会误删"装载实参的 MOV").
        if(op===O.CALL||op===O.CALLR) uses=uses.concat([0,1,2,3]);
        // LEAVE/RET/VM_EXIT 消费 R0 (返回值).
        if(op===O.LEAVE||op===O.RET||op===O.VM_EXIT){ uses=uses.concat(0); }
        const lb=new Set(live);
        for(const d of defs) lb.delete(d);
        for(const u of uses) lb.add(u);
        liveBefore[j]=lb;
        live=lb;
      }
    }
    const labelPos=new Set();
    if(seg.labelTable) for(const k in seg.labelTable) labelPos.add(seg.labelTable[k]);
    const delSet=new Set();
    for(let idx=0; idx<ins.length; idx++){
      const x=ins[idx]; if(x.op!==O.MOV) continue;
      const rd=code[x.i+1], rs=code[x.i+2];
      // 删除"目标寄存器已死"的 MOV. 允许的目的寄存器: caller-saved 临时 R1/R2/R3, 以及
      // callee-saved R4/R6/R7. 后者虽为被调用方保存寄存器, 但本 pass 的 liveBefore 已精确建模:
      //   * CALL 不重定义 R4/R6/R7 (defsOf(CALL)=[0,1,2,3]), 其活性跨调用可靠;
      //   * LEAVE/RET 的活性由 usesOf 增强(补 R0)保证, 不影响 R4/R6/R7 的死写判定.
      // 硬性排除: R0(返回值/实参, 调用点实参建模存在盲区), R5(BP 永不作为操作数).
      // 扩展 R4/R6/R7 可多消除 test4 中 10 条死 MOV (各 2B), 安全且经全回归验证 (verify.js).
      // 删除"目标寄存器已死"的 MOV. 允许的目的寄存器: caller-saved 临时 R1/R2/R3, 以及
      // callee-saved R4/R6/R7. 后者虽为被调用方保存寄存器, 但本 pass 的 liveBefore 已精确建模:
      //   * CALL 不重定义 R4/R6/R7 (defsOf(CALL)=[0,1,2,3]), 其活性跨调用可靠;
      //   * LEAVE/RET 的活性由 usesOf 增强(补 R0)保证, 不影响 R4/R6/R7 的死写判定.
      // 硬性排除: R0(返回值/实参, 调用点实参建模存在盲区), R5(BP 永不作为操作数).
      // 扩展 R4/R6/R7 可多消除 test4 中若干死 MOV (各 2B), 安全且经全回归验证 (verify.js).
      if(rd===0 || rd===5) continue;                  // R0(返回值/实参) / R5(BP) 永不删除
      if(rd!==1 && rd!==2 && rd!==3 && rd!==4 && rd!==6 && rd!==7) continue;
      if(rd===rs) continue;                        // 自拷贝
      if(labelPos.has(x.i)) continue;             // 跳转目标: 保守保留
      // rd 在紧邻下一条指令之前仍 live (被后续使用, 含跨块/循环/返回) -> 非死
      const nextLive=(idx+1<ins.length)? liveBefore[idx+1] : null;
      if(nextLive && nextLive.has(rd)) continue;
      delSet.add(x.i);
    }
    if(delSet.size===0) return false;
    this._tacReconstructCache(seg, { deleteSet: delSet });
    return true;
  }

  // =====================================================================
  _tacHoistImm(seg){
    const O=opcode;
    if(!this._globalEnabled()) return false;
    if(!seg.code || seg.code.length<2 || seg.code[0]!==O.ENTER) return false;
    const a=tac.tacAnalyze(seg.code, seg.labelTable);
    const code=seg.code, ins=a.cfg.ins;
    // 函数级被引用寄存器
    const usedRegs=new Set();
    for(let i=0;i<code.length;){ const opc=code[i], len=instrLen(opc);
      for(const r of tac.defsOf(opc,i,code)) usedRegs.add(r);
      for(const r of tac.usesOf(opc,i,code)) usedRegs.add(r);
      i+=len;
    }
    const POOL=[4,6,3,1,2,0,7];                 // 候选常量缓存寄存器 (避开 R5=BP)
    // callee-saved (R4/R6/R7) 只有已在 ENTER mask 中 (序言会保存/恢复) 才可挪用:
    // "函数内空闲" ≠ "调用者不依赖" —— 未保存的 callee 寄存器被本函数踩会破坏调用者
    // (test4.c spirw 曾把 #16 物化进未保存的 R7, 踩坏 demo 的循环计数器 → LCD 位序错乱).
    const enterMask=(code[1]>>8)&0xFF;
    const _rcSafe=(r)=> (r!==4 && r!==6 && r!==7) || !!(enterMask&(1<<r));
    const IMM_OPS=new Set([O.ORI,O.XORI,O.ANDI]); // TAC 无 BIC: &=~x 是 AND + 补数 MOVI
    const REG_OF={ [O.ORI]:O.OR, [O.XORI]:O.XOR, [O.ANDI]:O.AND };
    const CAND_IMM=(v)=> (typeof v==='number' && v>=0 && v<=255); // MOV Rd,#imm 合法域
    let changed=false;
    for(const lp of a.loops){
      if(a.cfg.blocks[lp.header].startIns===0) continue;            // header 不能是入口块
      // 屏障循环整体跳过 (调用/返回/VB 后别名/活性不可控)
      let barrier=false;
      for(const bid of lp.body){ const blk=a.cfg.blocks[bid];
        for(let idx=blk.startIns; idx<=blk.endIns; idx++){ if(tac.isBarrier(ins[idx].op)){ barrier=true; break; } }
        if(barrier) break;
      }
      if(barrier) continue;
      // preheader 计算 (同 _tacLICM / _tacCacheLoopBase)
      const hPreds=[...a.cfg.blocks[lp.header].pred].filter(bid=>!lp.body.has(bid));
      if(hPreds.length!==1) continue;
      const preId=hPreds[0];
      if(a.loops.some(l=>l!==lp && l.body.has(preId))) continue;
      const preBlk=a.cfg.blocks[preId];
      const lastIns=ins[preBlk.endIns];
      const headerWord=ins[a.cfg.blocks[lp.header].startIns].i;
      const headerLabels=[]; for(const k in seg.labelTable) if(seg.labelTable[k]===headerWord) headerLabels.push(+k);
      if(headerLabels.length===0) continue;
      const isTerm=tac.isTerminator(lastIns.op);
      const insertBeforeWord=isTerm ? lastIns.i : (lastIns.i+lastIns.len);
      // 收集循环体指令 (程序序)
      const loopIdxs=[];
      for(const bid of lp.body){ const blk=a.cfg.blocks[bid]; for(let idx=blk.startIns; idx<=blk.endIns; idx++) loopIdxs.push(idx); }
      loopIdxs.sort((p,q)=>ins[p].i-ins[q].i);
      const loopUsed=new Set();
      for(const idx of loopIdxs){ for(const r of tac.defsOf(ins[idx].op,ins[idx].i,code)) loopUsed.add(r); for(const r of tac.usesOf(ins[idx].op,ins[idx].i,code)) loopUsed.add(r); }
      const maxLoopWord=loopIdxs.reduce((m,idx)=>Math.max(m,ins[idx].i),-1);
      const postLoopUsed=new Set();
      for(let i=maxLoopWord+1;i<code.length;){ const opc=code[i], len=instrLen(opc);
        for(const r of tac.defsOf(opc,i,code)) postLoopUsed.add(r);
        for(const r of tac.usesOf(opc,i,code)) postLoopUsed.add(r);
        i+=len;
      }
      // 选常量缓存寄存器: Tier-1 (整函数空闲) → Tier-2 (循环体内空闲且循环后死亡)
      const chooseRc=(taken)=>{
        for(const r of POOL){ if(r===5) continue; if(!_rcSafe(r)) continue; if(usedRegs.has(r)) continue; if(taken.has(r)) continue; return r; }
        for(const r of POOL){ if(r===5) continue; if(!_rcSafe(r)) continue; if(loopUsed.has(r)) continue; if(postLoopUsed.has(r)) continue; if(taken.has(r)) continue; return r; }
        return -1;
      };
      const preheaderWords=[]; const replaceMap=new Map(); const deleteSet=new Set(); const taken=new Set();
      // BIC(分解形式 BIC rd,rd,rt) 中的 rt 若由紧邻的 MOVI rt,c(c<=255) 装载, 则 c 与 ORI 同值可共享物化寄存器.
      // 向后找最近的 MOVI rt,c, 其间不得有 rt 的其它定义或屏障.
      const _bicImmOf=(idx)=>{
        const x=ins[idx]; if(x.op!==O.BIC) return null;
        const rd=code[x.i+1], rs=code[x.i+2], rt=code[x.i+3];
        if(rs!==rd || rt===rd) return null;              // 仅分解形式 BIC rd,rd,rt
        for(let p=idx-1; p>=0; p--){
          const po=ins[p].op;
          if(po===O.MOVI && code[ins[p].i+1]===rt){
            const c=code[ins[p].i+2];
            return (c>=0 && c<=255) ? { mi: ins[p].i, c } : null;
          }
          if(tac.defsOf(po, ins[p].i, code).includes(rt)) return null;  // rt 被其它定义覆盖
          if(tac.isBarrier(po) || po===O.LABEL) return null;            // 控制/别名屏障或跨块
        }
        return null;
      };
      // 大立即数 |= c / ^= c 分解形式识别: 代码生成对大立即数走 "MOVI tmp,c; OR/XOR rd,tmp,rd"
      // (常数在 rs 位, rt===rd), 与 _bicImmOf 对称. 仅当 c 非 CAND_IMM 才走此分解 (小立即数走 ORI/XORI,
      // 由 IMM_OPS 分支处理), 故此处只认大立即数, 避免与 ORI 路径重复.
      const _aluImmOf=(idx, opNeed)=>{
        const x=ins[idx]; if(x.op!==opNeed) return null;
        const rd=code[x.i+1], rs=code[x.i+2], rt=code[x.i+3];
        if(rt!==rd) return null;                       // 仅分解形式 OR/XOR rd, rs, rd (常数在 rs)
        const cReg=rs;
        for(let p=idx-1; p>=0; p--){
          const po=ins[p].op;
          if(po===O.MOVI && code[ins[p].i+1]===cReg){
            const c=code[ins[p].i+2];
            return (!CAND_IMM(c)) ? { mi: ins[p].i, c } : null;  // 仅大立即数
          }
          if(tac.defsOf(po, ins[p].i, code).includes(cReg)) return null; // cReg 被其它定义覆盖
          if(tac.isBarrier(po) || po===O.LABEL) return null;             // 控制/别名屏障或跨块
        }
        return null;
      };
      // ---- Type B: ALU 立即数物化 (Pass 4 跨回边兜底) ----
      // 小立即数(CAND_IMM, MOV #imm 可编码): 以 ORI/XORI/ANDI 形式存在, 每出现即物化到 preheader, 循环内复用 Rc.
      // 大立即数(非 CAND_IMM): 代码生成走分解 "MOVI tmp,c; OR/XOR rd,tmp,rd" (常数在 rs 位, rt===rd),
      //   经 _aluImmOf 识别后同样物化到 preheader (MOVI 自动走字面池 LDR =c), 循环内复用 Rc. 仅当循环内
      //   出现 >=2 次才外提 —— 单点大立即数外提只会白白占用一个寄存器, 无净收益.
      const byImm=new Map(); // imm -> [ {i,op,rd,rs,rt?,blk,mi?,kind?} ]
      for(const idx of loopIdxs){ const x=ins[idx], op=x.op, i=x.i;
        if(IMM_OPS.has(op)){ const imm=code[i+3];
          if(!byImm.has(imm)) byImm.set(imm,[]);
          byImm.get(imm).push({i,op,rd:code[i+1],rs:code[i+2],blk:a.cfg.blockOfWord(i),kind:'imm'});
        }
        if(op===O.BIC){ const r=_bicImmOf(idx);
          if(r){ if(!byImm.has(r.c)) byImm.set(r.c,[]); byImm.get(r.c).push({i,op:O.BIC,rd:code[i+1],rs:code[i+2],blk:a.cfg.blockOfWord(i),mi:r.mi,kind:'bic'}); }
        }
        if(op===O.OR || op===O.XOR){ const r=_aluImmOf(idx, op);
          if(r){ if(!byImm.has(r.c)) byImm.set(r.c,[]); byImm.get(r.c).push({i,op,rd:code[i+1],rs:code[i+2],rt:code[i+3],blk:a.cfg.blockOfWord(i),mi:r.mi,kind:'decomp'}); }
        }
      }
      // 优先级: 每轮必执行 (被 header 支配) 的 imm 优先, 其次出现次数多者优先 —— 寄存器稀缺时先保高频
      const groups=[...byImm.entries()].map(([imm,occ])=>({
        imm, occ,
        unconditional: occ.every(o=>a.domInfo.dominates(lp.header, o.blk)),
        count: occ.length,
        large: !CAND_IMM(imm)
      }));
      groups.sort((p,q)=> (Number(q.unconditional)-Number(p.unconditional)) || (q.count-p.count));
      for(const g of groups){
        if(g.large && g.count<2) continue;   // 大立即数: 仅循环内出现 >=2 次才外提, 避免单点占用寄存器
        const Rc=chooseRc(taken); if(Rc<0) continue; taken.add(Rc);
        preheaderWords.push(O.MOVI, Rc, g.imm);
        for(const o of g.occ){
          if(o.kind==='decomp'){
            replaceMap.set(o.i, [o.op, o.rd, Rc, o.rt]);   // OR/XOR rd, Rc, rd (rt===rd), 共享物化寄存器 Rc
            deleteSet.add(o.mi);                            // 删除物化该 c 的 MOVI
          } else if(o.kind==='bic'){
            replaceMap.set(o.i, [O.BIC, o.rd, o.rd, Rc]);  // BIC rd, rd, Rc (复用正立即数 c)
            deleteSet.add(o.mi);                            // 删除物化该 c 的 MOVI
          } else {
            const regOp=REG_OF[o.op];
            replaceMap.set(o.i, [regOp, o.rd, o.rs, Rc]);
          }
        }
      }
      // ---- Type A: MOVI 多定义(全部同值) 外提 (方案C 安全子集) ----
      // 仅处理 LICM 跳过的 defCount(Rd)>1 且循环内 Rd 的全部 def 都是"同值 MOVI"的情形.
      const movByRd=new Map(); // rd -> [ {i,imm} ]
      for(const idx of loopIdxs){ const x=ins[idx], op=x.op, i=x.i;
        if(op===O.MOVI){ const rd=code[i+1], imm=code[i+2];
          if(rd!==5 && CAND_IMM(imm)){ if(!movByRd.has(rd)) movByRd.set(rd,[]); movByRd.get(rd).push({i,imm}); }
        }
      }
      const headerLiveIn=a.liveness.liveInBlock.get(lp.header);
      for(const [rd, list] of movByRd){
        if(list.length<2) continue;                       // 单定义留给 LICM
        const imm0=list[0].imm;
        if(!list.every(m=>m.imm===imm0)) continue;         // 不同值 -> 风险, 延后处理
        // 循环内 Rd 的全部 def 必须都是这些同值 MOVI (无其它 def 会覆盖)
        let defsRd=0;
        for(const idx of loopIdxs){ for(const r of tac.defsOf(ins[idx].op,ins[idx].i,code)) if(r===rd) defsRd++; }
        if(defsRd!==list.length) continue;
        if(headerLiveIn.has(rd)) continue;                 // def 不能 live-in header (preheader 覆盖会被提前用)
        let liveOut=false;
        for(const bid of lp.body){ const blk=a.cfg.blocks[bid];
          for(const s of blk.succ){ if(!lp.body.has(s) && a.liveness.liveOutBlock.get(bid).has(rd)){ liveOut=true; break; } }
          if(liveOut) break;
        }
        if(liveOut) continue;                              // 循环出口 live-out -> 保持 0 次迭代语义
        preheaderWords.push(O.MOVI, rd, imm0);             // preheader 建立 Rd=#imm
        for(const m of list) deleteSet.add(m.i);           // 删除循环内全部 (现已冗余)
      }
      if(preheaderWords.length===0) continue;
      this._tacReconstructCache(seg, { insertBeforeWord, preheaderWords, replaceMap, deleteSet });
      changed=true; break; // 定点迭代重分析
    }
    return changed;
  }

  _tacLICM(seg){
    const O=opcode;
    if(!seg.code || seg.code.length<2 || seg.code[0]!==O.ENTER) return false;
    const HOIST=new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,
      O.MOV,O.MOVI,O.LDA,O.LEA,O.LOAD_OFF,O.LOADB_OFF,O.LOADH_OFF]);

    let changed=false, guard=0;
    while(guard++<16){
      const code=seg.code;                       // 每轮取最新 code (_tacReconstruct 会重赋值 seg.code)
      // 函数级别名守卫: 任意计算地址访存 -> 不外提 LOAD_OFF (纯算术/MOV 仍可做); 每轮重算
      let hasComputedMem=false;
      { const all=tac.decode(code); for(const x of all){ if(x.op===O.LOAD||x.op===O.STORE||x.op===O.LOADB||x.op===O.STOREB||x.op===O.LOADH||x.op===O.STOREH) hasComputedMem=true; } }
      const a=tac.tacAnalyze(code, seg.labelTable);
      let hoisted=false;
      for(const lp of a.loops){
        // header 不能是入口块 (ENTER 之前不能插 preheader)
        if(a.cfg.blocks[lp.header].startIns===0) continue;
        // 含屏障(调用/返回/VB)的循环整体跳过
        let barrier=false;
        for(const bid of lp.body){
          const blk=a.cfg.blocks[bid];
          for(let idx=blk.startIns; idx<=blk.endIns; idx++){
            if(tac.isBarrier(a.cfg.ins[idx].op)){ barrier=true; break; }
          }
          if(barrier) break;
        }
        if(barrier) continue;
        // 预Header 计算: 循环必须有唯一非循环前驱 p, 且 p 不在任何其它循环体内
        // (否则外提到 p 会在 p 每次执行时重跑, 破坏"循环不变"语义). 外提代码插入 p.
        const hPreds=[...a.cfg.blocks[lp.header].pred].filter(bid=>!lp.body.has(bid));
        if(hPreds.length!==1) continue;            // 多入口/无入口循环: 保守跳过
        const preId=hPreds[0];
        if(a.loops.some(l=>l!==lp && l.body.has(preId))) continue; // p 在其它循环体内 -> 跳过
        const preBlk=a.cfg.blocks[preId];
        const lastIns=a.cfg.ins[preBlk.endIns];
        const headerWord=a.cfg.ins[a.cfg.blocks[lp.header].startIns].i;
        // header 的 label (用于 Case B 尾部 JMP; 回边必以某 label 指向 header, 故非空)
        const headerLabels=[];
        for(const k in seg.labelTable) if(seg.labelTable[k]===headerWord) headerLabels.push(+k);
        if(headerLabels.length===0) continue;     // 无 label 可跳 (理论不会发生) -> 跳过
        // Case A: preheader 末条是终止符(跳往 header / 条件分支) -> 外提代码插在其前.
        // Case B: preheader 末条顺序落入 header -> 外提代码插在其后, 并追加 JMP 到 header.
        const isTerm = tac.isTerminator(lastIns.op);
        const insertBeforeWord = isTerm ? lastIns.i : (lastIns.i + lastIns.len);
        const needTailJmp = !isTerm;
        // 收集循环体内指令, 统计 def 次数, 收集被写 slot
        const defCount=new Map(); const storedSlots=new Set(); const storedByteSlots=new Set();
        const loopInstrs=[];
        for(const bid of lp.body){
          const blk=a.cfg.blocks[bid];
          for(let idx=blk.startIns; idx<=blk.endIns; idx++){
            const x=a.cfg.ins[idx];
            const d=tac.defsOf(x.op,x.i,code), u=tac.usesOf(x.op,x.i,code);
            for(const r of d) defCount.set(r,(defCount.get(r)||0)+1);
            if(x.op===O.STORE_OFF) storedSlots.add(code[x.i+1]);
            if(x.op===O.STOREB_OFF||x.op===O.STOREH_OFF) storedByteSlots.add(code[x.i+1]);
            loopInstrs.push({idx,x,d,u});
          }
        }
        // avail: 循环内从不被重定义的寄存器 (在 preheader 持有 live-in 值)
        const avail=new Set();
        for(let r=0;r<=7;r++) if(!(defCount.get(r)>0)) avail.add(r);
        const headerLiveIn=a.liveness.liveInBlock.get(lp.header);
        const hoistIdx=new Set();
        let progress=true;
        while(progress){
          progress=false;
          for(const li of loopInstrs){
            if(hoistIdx.has(li.idx)) continue;
            if(!HOIST.has(li.x.op)) continue;
            if(li.d.length!==1) continue;             // 单 def
            const def=li.d[0];
            if(def===5) continue;                      // R5=BP
            if((defCount.get(def)||0)>1) continue;     // 同寄存器多次定义 -> 跳过
            let ok=true; for(const r of li.u){ if(!avail.has(r)){ ok=false; break; } }
            if(!ok) continue;
            if(headerLiveIn.has(def)) continue;        // def 不能 live-in header
            // def 不能在循环出口 live-out
            let liveOutExit=false;
            for(const bid of lp.body){
              const blk=a.cfg.blocks[bid];
              for(const s of blk.succ){ if(!lp.body.has(s) && a.liveness.liveOutBlock.get(bid).has(def)){ liveOutExit=true; break; } }
              if(liveOutExit) break;
            }
            if(liveOutExit) continue;
            // LOAD_OFF 类的别名守卫
            if(li.x.op===O.LOAD_OFF){ if(storedSlots.has(code[li.x.i+2])) continue; if(hasComputedMem) continue; }
            if(li.x.op===O.LOADB_OFF||li.x.op===O.LOADH_OFF){ if(storedByteSlots.has(code[li.x.i+2])) continue; if(hasComputedMem) continue; }
            hoistIdx.add(li.idx); avail.add(def); progress=true;
          }
        }
        if(hoistIdx.size===0) continue;
        // 外提: 把 loopInstrs[hoistIdx] 从循环体删除, 插到 preheader (p) 的插入点.
        // 若 preheader 末条顺序落入 header (Case B), 追加 JMP 到 header 收尾,
        // 使外提代码成为独立 preheader 块(不在循环体内), 重分析时不会被再次外提.
        const sorted=loopInstrs.filter(li=>hoistIdx.has(li.idx)).sort((p,q)=>p.idx-q.idx);
        const insertWords=[]; const deleteSet=new Set();
        for(const li of sorted){ for(let j=0;j<li.x.len;j++) insertWords.push(code[li.x.i+j]); deleteSet.add(li.x.i); }
        if(needTailJmp){ insertWords.push(O.JMP); insertWords.push(-headerLabels[0]); }
        this._tacReconstruct(seg, {deleteSet, insertBeforeWord, insertWords});
        hoisted=true; changed=true;
        break; // 重分析
      }
      if(!hoisted) break;
    }
    return changed;
  }

  _peepholeSeg(seg){
    const code=seg.code, n=code.length, O=opcode;
    // 1) 解码为指令列表 (记录起始字索引与长度)
    const instrs=[];
    for(let i=0;i<n;){ const opc=code[i]; const len=instrLen(opc); instrs.push({opc,i,len}); i+=len; }
    // 2) 基本块首 (跳转目标) 字索引集合
    const leader=new Set();
    if(seg.labelTable) for(const k in seg.labelTable) leader.add(seg.labelTable[k]);
    const isLeader=idx=>leader.has(idx);

    // ---- 指令语义: 目标寄存器 / 源寄存器 / 是否纯寄存器写 ----
    // 纯寄存器写: 唯一副作用是写目标 GP 寄存器 (无内存写/栈/跳转/标志/调用)
    const isPureDef=o => (o>=0&&o<=31)||o===O.BIC||o===O.LOAD_OFF||o===O.LOAD||o===O.LOADB||
      o===O.LOADH||o===O.LOADB_OFF||o===O.LOADH_OFF||o===O.LEA||o===O.MOVI||o===O.LDA||o===O.MOV;
    const defReg=ins=>{ const o=ins.opc,i=ins.i;
      if(isPureDef(o)||o===O.POP) return code[i+1];
      return -1; };
    const usesReg=ins=>{ const o=ins.opc,i=ins.i;
      if(o>=0&&o<=15) return [code[i+2],code[i+3]];      // ADD..GE rd,rs,rt
      if(o===O.BIC) return [code[i+2],code[i+3]];        // BIC rd, rs, rt: rs, rt
      if(o>=16&&o<=31) return [code[i+2]];               // ADDI..GEI rd,rs,imm
      if(o===O.CMP) return [code[i+1],code[i+2]];
      if(o===O.CMPI) return [code[i+1]];
      if(o===O.LOAD||o===O.LOADB||o===O.LOADH) return [code[i+2]]; // rd,rs
      if(o===O.MOV) return [code[i+2]];                  // rd,rs
      if(o===O.STORE_OFF||o===O.STOREB_OFF||o===O.STOREH_OFF) return [code[i+2]]; // off,rs
      if(o===O.STORE||o===O.STOREB||o===O.STOREH) return [code[i+1],code[i+2]];   // rd(addr),rs
      if(o===O.PUSH) return [code[i+1]];
      if(o===O.JZ||o===O.JNZ) return [code[i+1]];
      if(o===O.CALLR) return [code[i+1]];
      return []; };

    const isJumpOp = o => o===O.JMP || o===O.JZ || o===O.JNZ || (o>=O.JEQ && o<=O.JGE);
    const jumpTargetWord = (o,i) => (o===O.JZ||o===O.JNZ) ? i+2 : i+1;
    const keep=new Array(instrs.length).fill(true);
    const repl=new Array(instrs.length).fill(null); // 替换指令 (可改变长度: 4字→3字)
    let removedInstr=0, replacedInstr=0;

    for(let k=0;k<instrs.length;k++){
      const cur=instrs[k];
      if(!keep[k]) continue;
      const op=cur.opc;
      // ---- P7: 代数恒等式化简 (单指令, 无块首约束) ----
      if(op>=16 && op<=31){            // 立即数算术/逻辑: [op,rd,rs,imm]
        const rd=code[cur.i+1], rs=code[cur.i+2], imm=code[cur.i+3];
        let r7=null;
        if(op===O.ADDI||op===O.SUBI){ if(imm===0) r7=(rd===rs)?'del':[O.MOV,rd,rs]; }
        else if(op===O.MULI){ if(imm===1) r7=(rd===rs)?'del':[O.MOV,rd,rs]; else if(imm===0) r7=[O.MOVI,rd,0]; }
        else if(op===O.DIVI){ if(imm===1) r7=(rd===rs)?'del':[O.MOV,rd,rs]; }
        else if(op===O.MODI){ if(imm===1) r7=[O.MOVI,rd,0]; }
        else if(op===O.ORI||op===O.XORI){ if(imm===0) r7=(rd===rs)?'del':[O.MOV,rd,rs]; }
        else if(op===O.ANDI){ if(imm===0) r7=[O.MOVI,rd,0]; }
        else if(op===O.SHLI||op===O.SHRI){ if(imm===0) r7=(rd===rs)?'del':[O.MOV,rd,rs]; }
        if(r7!==null){
          if(r7==='del'){ keep[k]=false; removedInstr++; }
          else { repl[k]=r7; replacedInstr++; }
          continue;
        }
      } else if(op>=0 && op<=15){       // 寄存器算术/逻辑/比较: [op,rd,rs,rt]
        const rd=code[cur.i+1], rs=code[cur.i+2], rt=code[cur.i+3];
        let r7=null;
        if(op===O.SUB||op===O.XOR){ if(rs===rt) r7=[O.MOVI,rd,0]; }
        else if(op===O.AND||op===O.OR){ if(rs===rt) r7=(rd===rs)?'del':[O.MOV,rd,rs]; }
        else if(op===O.EQ){ if(rs===rt) r7=[O.MOVI,rd,1]; }
        else if(op===O.NE){ if(rs===rt) r7=[O.MOVI,rd,0]; }
        else if(op===O.LT||op===O.GT){ if(rs===rt) r7=[O.MOVI,rd,0]; }
        else if(op===O.LE||op===O.GE){ if(rs===rt) r7=[O.MOVI,rd,1]; }
        if(r7!==null){
          if(r7==='del'){ keep[k]=false; removedInstr++; }
          else { repl[k]=r7; replacedInstr++; }
          continue;
        }
      }
      // ---- P8: 跳转线程 + 冗余跳 (无条件/条件跳统一) ----
      if(isJumpOp(op) && seg.labelTable){
        const tw=jumpTargetWord(op,cur.i);
        const tgt=code[tw];
        if(tgt<0){
          const tpos=seg.labelTable[-tgt];
          if(tpos===cur.i+cur.len && !isLeader(cur.i)){ keep[k]=false; removedInstr++; continue; }
          if(tpos!==undefined && code[tpos]===O.JMP){
            let m=code[tpos+1]; const seen=new Set([tgt]); let p=tpos;
            while(code[p]===O.JMP){ const mm=code[p+1]; if(seen.has(mm))break; seen.add(mm); m=mm; p=seg.labelTable[-mm]; if(p===undefined)break; }
            if(m!==tgt){ code[tw]=m; replacedInstr++; }
          }
        }
      }
      // P1: MOV rd,rd
      if(op===O.MOV && code[cur.i+1]===code[cur.i+2] && !isLeader(cur.i)){
        keep[k]=false; removedInstr++; continue;
      }
      // P5: 死寄存器写 — cur 纯写 rd, 下一条 (紧邻) 重写 rd 且不读 rd
      if(isPureDef(op) && k+1<instrs.length && keep[k+1] && repl[k+1]===null){
        const D=code[cur.i+1];
        const nxt=instrs[k+1];
        if(defReg(nxt)===D && !usesReg(nxt).includes(D)){
          keep[k]=false; removedInstr++; continue;
        }
      }
      // P6: PUSH ra ; POP rb → MOV rb,ra (ra===rb 时全删); POP 不可为块首
      if(op===O.PUSH && k+1<instrs.length && keep[k+1] && repl[k+1]===null){
        const nxt=instrs[k+1];
        if(nxt.opc===O.POP && !isLeader(nxt.i)){
          const ra=code[cur.i+1], rb=code[nxt.i+1];
          keep[k]=false; removedInstr++;
          if(ra===rb){ keep[k+1]=false; removedInstr++; }
          else { repl[k+1]=[O.MOV, rb, ra]; replacedInstr++; }
          continue;
        }
      }
      // 配对模式: 需紧邻前一条存在、被保留且未被替换, 且当前非块首
      if(k>0 && keep[k-1] && repl[k-1]===null && !isLeader(cur.i)){
        const prev=instrs[k-1];
        // P2: STORE_OFF off,rs ; LOAD_OFF rd,off → 存储转发
        if(prev.opc===O.STORE_OFF && op===O.LOAD_OFF){
          const off1=code[prev.i+1], rs=code[prev.i+2];
          const rd=code[cur.i+1], off2=code[cur.i+2];
          if(off1===off2){
            if(rd===rs){ keep[k]=false; removedInstr++; }
            else { repl[k]=[O.MOV, rd, rs]; replacedInstr++; }
            continue;
          }
        }
        // P3: LOAD_OFF rd1,off ; LOAD_OFF rd2,off → 冗余重载
        if(prev.opc===O.LOAD_OFF && op===O.LOAD_OFF){
          const rd1=code[prev.i+1], off1=code[prev.i+2];
          const rd2=code[cur.i+1], off2=code[cur.i+2];
          if(off1===off2){
            if(rd1===rd2){ keep[k]=false; removedInstr++; }
            else { repl[k]=[O.MOV, rd2, rd1]; replacedInstr++; }
            continue;
          }
        }
      }
    }

    if(removedInstr===0 && replacedInstr===0) return 0;

    // 3) 重建代码 + 建立完整的字级重映射 (旧字索引 → 新字索引)
    const remap=new Map();
    const newCode=[];
    const hasColors=Array.isArray(seg.colors)||ArrayBuffer.isView(seg.colors);
    const newColors=hasColors?[]:null;
    for(let k=0;k<instrs.length;k++){
      const cur=instrs[k];
      const base=newCode.length;
      if(!keep[k]){
        // 删除的指令: 其所有字映射到"下一条幸存指令的起点"(= 当前 base),
        // 这正好把落在被删指令上的标签迁移到后继指令 (语义等价)。
        for(let j=0;j<cur.len;j++) remap.set(cur.i+j, base);
        continue;
      }
      const words=repl[k]?repl[k]:code.slice(cur.i,cur.i+cur.len);
      for(let j=0;j<words.length;j++){
        remap.set(cur.i+j, base+j);
        newCode.push(words[j]);
        if(newColors) newColors.push(hasColors?(seg.colors[cur.i+j]||0):0);
      }
    }
    remap.set(n, newCode.length); // 段末哨兵 (指向末尾的标签)

    // 4) 重映射所有按位置记录的数据
    if(seg.labelTable){
      for(const k in seg.labelTable){
        const nv=remap.get(seg.labelTable[k]);
        if(nv!==undefined) seg.labelTable[k]=nv;
      }
    }
    if(seg.callFixups){
      for(const fx of seg.callFixups){
        const nw=remap.get(fx.pos>>2);
        if(nw!==undefined) fx.pos=nw<<2;
      }
    }
    if(this.funcAddrFixups){
      for(const fx of this.funcAddrFixups){
        if(fx.segIdx===seg.funcId){
          const nw=remap.get(fx.wordPos);
          if(nw!==undefined) fx.wordPos=nw;
        }
      }
    }

    if(this.srcLineMap) this._remapSrcLineMap(seg, remap);
    seg.code=newCode;
    if(newColors) seg.colors=newColors;
    seg.length=newCode.length*4;
    return removedInstr + replacedInstr;
  }

  // =====================================================================
  // C 层优化 pass 共用的寄存器 def/use 查询 + 重建例程
  // =====================================================================
  _defOf(op,i,code){ const O=opcode;
    if(op>=0&&op<=31) return code[i+1];                                  // ADD..GE / ADDI..GEI: rd
    if(op===O.BIC) return code[i+1];                                     // BIC rd, rs, rt: rd
    if(op===O.MOV||op===O.MOVI||op===O.LDA||op===O.LEA) return code[i+1];
    if(op===O.POP) return code[i+1];
    if(op===O.LOAD||op===O.LOADB||op===O.LOADH||op===O.LOAD_OFF||op===O.LOADB_OFF||op===O.LOADH_OFF) return code[i+1];
    if(op===O.SYS_CALL) return 0;                                        // 系统调用结果写入 r0
    return -1;
  }
  _useOf(op,i,code){ const O=opcode;
    if(op>=0&&op<=15) return [code[i+2],code[i+3]];                     // ADD..GE rd,rs,rt
    if(op===O.BIC) return [code[i+2],code[i+3]];                        // BIC rd, rs, rt: rs, rt
    if(op>=16&&op<=31) return [code[i+2]];                              // ADDI..GEI rd,rs,imm
    if(op===O.CMP) return [code[i+1],code[i+2]];
    if(op===O.CMPI) return [code[i+1]];
    if(op===O.MOV) return [code[i+2]];                                  // rd,rs
    if(op===O.LOAD||op===O.LOADB||op===O.LOADH) return [code[i+2]];     // rd,rs
    if(op===O.STORE_OFF||op===O.STOREB_OFF||op===O.STOREH_OFF) return [code[i+2]]; // off,rs
    if(op===O.STORE||op===O.STOREB||op===O.STOREH) return [code[i+1],code[i+2]];   // rd(addr),rs
    if(op===O.PUSH) return [code[i+1]];
    if(op===O.JZ||op===O.JNZ) return [code[i+1]];
    if(op===O.CALLR) return [code[i+1]];
    return [];
  }
  _isPureDef(op){ const O=opcode;
    // 注意: POP 不在列内 —— POP 除写寄存器外还调整栈指针(SP 副作用),
    // 删除"结果未被使用"的 POP 会破坏 PUSH/POP 栈平衡(即使其目标寄存器看似死值).
    // PUSH 同理有栈副作用, 但它不定义寄存器, 本函数本就不覆盖, 此处仅显式排除 POP.
    return (op>=0&&op<=31)||op===O.BIC||op===O.MOV||op===O.MOVI||op===O.LDA||op===O.LEA||
      op===O.LOAD||op===O.LOADB||op===O.LOADH||op===O.LOAD_OFF||op===O.LOADB_OFF||op===O.LOADH_OFF;
  }
  // 把指令 op 在字索引 i 处对寄存器 r 的使用改写为 sub (仅改寄存器操作数, 不动立即数)
  _rewriteUse(op,i,r,sub,code){ const O=opcode;
    if(op>=0&&op<=15){ if(code[i+2]===r)code[i+2]=sub; if(code[i+3]===r)code[i+3]=sub; return; }
    if(op===O.BIC){ if(code[i+2]===r)code[i+2]=sub; if(code[i+3]===r)code[i+3]=sub; return; }
    if(op>=16&&op<=31){ if(code[i+2]===r)code[i+2]=sub; return; }
    if(op===O.CMP){ if(code[i+1]===r)code[i+1]=sub; if(code[i+2]===r)code[i+2]=sub; return; }
    if(op===O.CMPI){ if(code[i+1]===r)code[i+1]=sub; return; }
    if(op===O.MOV){ if(code[i+2]===r)code[i+2]=sub; return; }
    if(op===O.LOAD||op===O.LOADB||op===O.LOADH){ if(code[i+2]===r)code[i+2]=sub; return; }
    if(op===O.STORE_OFF||op===O.STOREB_OFF||op===O.STOREH_OFF){ if(code[i+2]===r)code[i+2]=sub; return; }
    if(op===O.STORE||op===O.STOREB||op===O.STOREH){ if(code[i+1]===r)code[i+1]=sub; if(code[i+2]===r)code[i+2]=sub; return; }
    if(op===O.PUSH){ if(code[i+1]===r)code[i+1]=sub; return; }
    if(op===O.JZ||op===O.JNZ){ if(code[i+1]===r)code[i+1]=sub; return; }
    if(op===O.CALLR){ if(code[i+1]===r)code[i+1]=sub; return; }
  }

  // ---- C 层 pass 1: 局部拷贝传播 (仅改写操作数, 不改长度/位置) ----
  // 每个基本块内, MOV rd,rs 建立 rd→rs 映射; 其后对 rd 的使用替换为 rs,
  // 直至 rd 或 rs 被重定义. 跨越 CALL/CALLR/SYS_CALL 时调用者保存寄存器(0..3)失效 → 清映射.
  // r5(BP) 视为特殊寄存器, 不参与拷贝传播, 避免破坏帧基址语义.
  peepholeCopyProp(seg){
    const code=seg.code, O=opcode, n=code.length;
    const instrs=[]; for(let i=0;i<n;){ const opc=code[i],len=instrLen(opc); instrs.push({opc,i,len}); i+=len; }
    const leader=new Set(); if(seg.labelTable) for(const k in seg.labelTable) leader.add(seg.labelTable[k]);
    const copy=new Map(); let changed=false;
    let bi=0;
    while(bi<instrs.length){
      let bj=bi; while(bj+1<instrs.length && !leader.has(instrs[bj+1].i)) bj++;
      copy.clear();
      for(let k=bi;k<=bj;k++){
        const cur=instrs[k], o=cur.opc, i=cur.i;
        for(const r of this._useOf(o,i,code)){
          if(r===5) continue;
          if(copy.has(r)){ this._rewriteUse(o,i,r,copy.get(r),code); changed=true; }
        }
        const d=this._defOf(o,i,code);
        if(d>=0){
          for(const key of [...copy.keys()]) if(copy.get(key)===d) copy.delete(key);
          copy.delete(d);
        }
        if(o===O.MOV){
          const rd=code[i+1], rs=code[i+2];
          if(rd===5||rs===5){ copy.delete(rd); }
          else { let s=rs; if(copy.has(s)) s=copy.get(s); if(s!==rd) copy.set(rd,s); else copy.delete(rd); }
        }
        if(o===O.CALL||o===O.CALLR||o===O.SYS_CALL){
          for(const key of [...copy.keys()]){ const v=copy.get(key); if(key<=3||v<=3) copy.delete(key); }
        }
      }
      bi=bj+1;
    }
    return changed;
  }

  // ---- C 层 pass 2: 局部死代码消除 (块内非相邻, 安全准则) ----
  // 纯寄存器写 rd, 若在块内其后到块末(或到 CALL/RET/跳转)之间 rd 被重定义且从未被读,
  // 则该写为死写 → 删除. 不删除可能 live-out 到后继块的写 (保守).
  _peepholeDCE(seg){
    const code=seg.code, O=opcode, n=code.length;
    const instrs=[]; for(let i=0;i<n;){ const opc=code[i],len=instrLen(opc); instrs.push({opc,i,len}); i+=len; }
    const leader=new Set(); if(seg.labelTable) for(const k in seg.labelTable) leader.add(seg.labelTable[k]);
    const keep=new Array(instrs.length).fill(true);
    let removed=0;
    let bi=0;
    while(bi<instrs.length){
      let bj=bi; while(bj+1<instrs.length && !leader.has(instrs[bj+1].i)) bj++;
      for(let k=bi;k<=bj;k++){
        const cur=instrs[k]; const d=this._defOf(cur.opc,cur.i,code);
        if(d<0 || !this._isPureDef(cur.opc) || !keep[k]) continue;
        let dead=false;
        for(let j=k+1;j<=bj;j++){
          const jo=instrs[j].opc;
          if(jo===O.CALL||jo===O.CALLR||jo===O.SYS_CALL||jo===O.RET) break;
          if(this._useOf(jo,instrs[j].i,code).includes(d)){ dead=false; break; }
          // 控制转移: 跳转目标处 d 可能仍活跃 (如底部测试循环的回跳边),
          // 线性扫描不能越过分支去看 fallthrough 侧的重定义.
          if(jo===O.JMP||jo===O.JZ||jo===O.JNZ||(jo>=O.JEQ&&jo<=O.JGE)) break;
          if(this._defOf(jo,instrs[j].i,code)===d){ dead=true; break; }
        }
        if(dead){ keep[k]=false; removed++; }
      }
      bi=bj+1;
    }
    if(removed===0) return 0;
    this._rebuild(seg, instrs, keep, new Array(instrs.length).fill(null));
    return removed;
  }

  // =====================================================================
  // C 层 pass 2b: 冗余 scratch 溢出消除 (PUSH r ... POP r, r 在 POP 后已死)
  // ---------------------------------------------------------------------
  // 动机: codegen 的 _emitThumbSafeRI 分解立即数时保守地
  //   PUSH tmp1; MOVI tmp1,imm; OP rd,rs,tmp1; POP tmp1
  // 以保证 scratch 不冲突. 但绝大多数调用点 tmp1 在 POP 之后立刻被重定义
  // (下一次表达式求值又从 acc 开始), 此时 POP 恢复的是死值, PUSH/POP 纯属浪费
  // (M0 上各 1 条指令 + 2 次访存).
  //
  // 安全规则 (全部必须满足才删):
  //   1. PUSH r 与配对的 POP r 在同一基本块内 (块内无 label/分支, 无控制流跳入跳出,
  //      故不存在"从别处跳进区间"或"从区间跳走"导致栈失衡的可能);
  //   2. 用栈深度模拟找配对: 区间内 PUSH 加深、POP 变浅, 深度归零处即配对 POP;
  //   3. 区间内不含 CALL/CALLR/SYS_CALL/ADJ/ENTER/LEAVE/RET (它们动栈或有调用约定);
  //   4. POP 的目标寄存器 == PUSH 的源寄存器;
  //   5. r 在 POP 之后已死.
  //
  // 关键难点 — 自维持活性 (self-sustaining liveness):
  //   TAC PUSH r 在标准 def/use 里算 use(r). 于是循环体内两个相邻的冗余 spill 对
  //     PUSH R1; BIC R0,R0,R3; POP R1;  ...  PUSH R1; MOVI R1,#8; BIC; POP R1
  //   会互相把对方"撑活": 前一对的 POP 之后遇到后一对的 PUSH (use R1) → 判活;
  //   后一对经循环回边又遇到前一对的 PUSH → 判活. 两个纯垃圾 spill 谁也删不掉.
  // 解法 — 乐观迭代 (optimistic fixpoint):
  //   先假设"全部自平衡对都可删": 做活性分析时忽略候选对的 PUSH(不算 use) 与
  //   POP(不算 def). 再逐对验证; 任何一对验证失败就退出候选集 (其 PUSH 恢复为
  //   真 use, POP 恢复为真 def), 重算活性并重新验证, 直到不动点. 单调收缩必收敛.
  //   最终留在候选集里的对, 在"其余候选也被删"的前提下同时成立 → 可一起删除.
  // 函数出口块 (无后继) 的 liveOut 置为 {R0,R4,R6,R7}: 保住返回值与 callee-saved.
  // 成对删除 → 栈始终平衡. 门控: _globalEnabled(); C4_NO_DEADSPILL 可关闭做对照.
  // =====================================================================
  _tacElimDeadSpill(seg){
    if(this.opts.noDeadSpill) return 0;
    const code=seg.code, O=opcode, n=code.length;
    if(!code || n<2 || code[0]!==O.ENTER) return 0;
    let ana=null;
    try{ ana=tac.tacAnalyze(code, seg.labelTable); }catch(e){ return 0; }
    if(!ana || !ana.cfg || !ana.cfg.blocks.length) return 0;
    const ins=ana.cfg.ins, blocks=ana.cfg.blocks;
    const isBarrier=(o)=> o===O.CALL||o===O.CALLR||o===O.SYS_CALL||o===O.ADJ||
                          o===O.ENTER||o===O.LEAVE||o===O.RET;

    // ---- 1) 收集自平衡 spill 对 (PUSH r ... POP r, 同块, 栈深度配对, 区间无 barrier) ----
    const pairs=[]; const pairOf=new Map();   // 指令下标 → pair 序号
    const blkOfIns=new Map();                 // 指令下标 → 块 id
    for(const b of blocks) for(let k=b.startIns;k<=b.endIns;k++) blkOfIns.set(k,b.id);
    for(const blk of blocks){
      for(let k=blk.startIns;k<=blk.endIns;k++){
        if(ins[k].op!==O.PUSH || pairOf.has(k)) continue;
        const r=code[ins[k].i+1];
        if(r===5) continue;                   // R5=BP 永不参与
        let depth=1, pop=-1, bad=false;
        for(let j=k+1;j<=blk.endIns;j++){
          const jo=ins[j].op;
          if(isBarrier(jo)){ bad=true; break; }
          if(jo===O.PUSH) depth++;
          else if(jo===O.POP){ depth--; if(depth===0){ pop=j; break; } }
        }
        if(bad || pop<0 || pairOf.has(pop)) continue;
        if(code[ins[pop].i+1]!==r) continue;  // 必须 POP 回同一寄存器
        const id=pairs.length;
        pairs.push({push:k, pop, reg:r});
        pairOf.set(k,id); pairOf.set(pop,id);
      }
    }
    if(!pairs.length) return 0;

    // ---- 2) 候选集 + 忽略候选对的 def/use 视图 ----
    const cand=new Set(pairs.map((_,i)=>i));
    const EMPTY=[];
    const defsAt=(k)=>{
      const id=pairOf.get(k);
      if(id!==undefined && cand.has(id) && ins[k].op===O.POP) return EMPTY;
      return tac.defsOf(ins[k].op, ins[k].i, code);
    };
    const usesAt=(k)=>{
      const id=pairOf.get(k);
      if(id!==undefined && cand.has(id) && ins[k].op===O.PUSH) return EMPTY;
      return tac.usesOf(ins[k].op, ins[k].i, code);
    };

    // ---- 3) 块级活性 (反向数据流, 使用上面的自定义 def/use 视图) ----
    const liveIn=new Map(), liveOut=new Map();
    const computeLive=()=>{
      for(const b of blocks){ liveIn.set(b.id,new Set()); liveOut.set(b.id,new Set()); }
      let changed=true, guard=0;
      while(changed && guard++<400){
        changed=false;
        for(let bi=blocks.length-1;bi>=0;bi--){
          const b=blocks[bi];
          const out=new Set();
          for(const s of b.succ) for(const r of liveIn.get(s)) out.add(r);
          // 函数出口 (无后继): 返回值 R0 + callee-saved R4/R6/R7 视为活
          if(b.succ.size===0){ out.add(0); out.add(4); out.add(6); out.add(7); }
          const live=new Set(out);
          for(let k=b.endIns;k>=b.startIns;k--){
            for(const d of defsAt(k)) if(d!==5) live.delete(d);
            for(const u of usesAt(k)) if(u!==5) live.add(u);
          }
          const ci=liveIn.get(b.id);
          let same=live.size===ci.size; if(same) for(const r of live) if(!ci.has(r)){ same=false; break; }
          if(!same){ liveIn.set(b.id,live); changed=true; }
          const co=liveOut.get(b.id);
          let osame=out.size===co.size; if(osame) for(const r of out) if(!co.has(r)){ osame=false; break; }
          if(!osame){ liveOut.set(b.id,out); changed=true; }
        }
      }
    };

    // ---- 4) 乐观迭代验证: 失败者退出候选集, 重算, 直到不动点 ----
    let guard=0;
    while(guard++ <= pairs.length+1){
      computeLive();
      let dropped=false;
      for(const id of [...cand]){
        const p=pairs[id];
        const bid=blkOfIns.get(p.pop);
        const blk=blocks[bid];
        let dead=null;
        for(let j=p.pop+1;j<=blk.endIns;j++){
          if(usesAt(j).includes(p.reg)){ dead=false; break; }
          if(defsAt(j).includes(p.reg)){ dead=true; break; }
        }
        if(dead===null){
          const lo=liveOut.get(bid);
          dead = lo ? !lo.has(p.reg) : false;   // 无活性信息 → 保守不删
        }
        if(!dead){ cand.delete(id); dropped=true; }
      }
      if(!dropped) break;
    }
    if(!cand.size) return 0;

    // ---- 5) 成对删除 ----
    const keep=new Array(ins.length).fill(true);
    let removed=0;
    for(const id of cand){ keep[pairs[id].push]=false; keep[pairs[id].pop]=false; removed+=2; }
    const instrs=ins.map(x=>({opc:x.op, i:x.i, len:x.len}));
    this._rebuild(seg, instrs, keep, new Array(ins.length).fill(null));
    return removed;
  }

  // ---- C 层 pass 3: 局部公共子表达式消除 (块内 value numbering) ----
  // 仅对纯寄存器计算 (op 0..31): 若块内前方已以相同 (op, 操作数含立即数) 算过,
  // 则本指令改写为 MOV rd, oldReg (随后由拷贝传播/P1 折叠). 操作数或结果寄存器
  // 被重定义时失效; 跨越调用清表. 不含访存指令 (避免别名误判).
  peepholeCSE(seg){
    const code=seg.code, O=opcode, n=code.length;
    const instrs=[]; for(let i=0;i<n;){ const opc=code[i],len=instrLen(opc); instrs.push({opc,i,len}); i+=len; }
    const leader=new Set(); if(seg.labelTable) for(const k in seg.labelTable) leader.add(seg.labelTable[k]);
    const keep=new Array(instrs.length).fill(true);
    const repl=new Array(instrs.length).fill(null);
    let changed=false;
    let bi=0;
    while(bi<instrs.length){
      let bj=bi; while(bj+1<instrs.length && !leader.has(instrs[bj+1].i)) bj++;
      const avail=new Map(); // op -> [{ops:[reg/imm...], reg}]
      for(let k=bi;k<=bj;k++){
        const cur=instrs[k], o=cur.opc, i=cur.i;
        const d=this._defOf(o,i,code);
        if(d>=0 && o>=0 && o<=31){
          const ops=[code[i+2], code[i+3]]; // 寄存器操作数 + 立即数 (imm 对 ADDI..GEI 在 i+3)
          const list=avail.get(o)||[];
          let found=null;
          for(const e of list){ if(e.ops.length===ops.length && e.ops.every((v,p)=>v===ops[p])){ found=e; break; } }
          if(found && found.reg!==d){ repl[k]=[O.MOV,d,found.reg]; changed=true; }
          else if(!found){ avail.set(o, list.concat([{ops,reg:d}])); }
        }
        if(d>=0){ for(const op of [...avail.keys()]){ avail.set(op, avail.get(op).filter(e=>!e.ops.includes(d) && e.reg!==d)); } }
        if(o===O.CALL||o===O.CALLR||o===O.SYS_CALL){ avail.clear(); }
      }
      bi=bj+1;
    }
    if(!changed) return 0;
    this._rebuild(seg, instrs, keep, repl);
    return 1;
  }

  // 共用: 按 keep/repl 重建代码并字级重映射 (与 _peepholeSeg 完全一致的契约)
  _rebuild(seg, instrs, keep, repl){
    const code=seg.code, remap=new Map(), newCode=[];
    const hasColors=Array.isArray(seg.colors)||ArrayBuffer.isView(seg.colors);
    const newColors=hasColors?[]:null;
    const n=code.length;
    for(let k=0;k<instrs.length;k++){
      const cur=instrs[k]; const base=newCode.length;
      if(!keep[k]){ for(let j=0;j<cur.len;j++) remap.set(cur.i+j, base); continue; }
      const words=repl[k]?repl[k]:code.slice(cur.i,cur.i+cur.len);
      for(let j=0;j<words.length;j++){
        remap.set(cur.i+j, base+j);
        newCode.push(words[j]);
        if(newColors) newColors.push(hasColors?(seg.colors[cur.i+j]||0):0);
      }
    }
    remap.set(n, newCode.length); // 段末哨兵
    if(seg.labelTable){ for(const k in seg.labelTable){ const nv=remap.get(seg.labelTable[k]); if(nv!==undefined) seg.labelTable[k]=nv; } }
    if(seg.callFixups){ for(const fx of seg.callFixups){ const nw=remap.get(fx.pos>>2); if(nw!==undefined) fx.pos=nw<<2; } }
    if(this.funcAddrFixups){ for(const fx of this.funcAddrFixups){ if(fx.segIdx===seg.funcId){ const nw=remap.get(fx.wordPos); if(nw!==undefined) fx.wordPos=nw; } } }
    if(this.srcLineMap) this._remapSrcLineMap(seg, remap);
    seg.code=newCode;
    if(newColors) seg.colors=newColors;
    seg.length=newCode.length*4;
  }

  // =====================================================================
  // 全局 CSE (跨块公共子表达式消除) — 全局值编号 (GVN) + 可用表达式 (must) 前向数据流.
  // 关键: 表达式 key 用"值编号"而非"寄存器号", 故"同值不同物理寄存器"的表达式
  //   (codegen 把局部变量 LOAD_OFF 到不同临时寄存器) 也能被识别为同一表达式并复用.
  // 值编号: vn[reg] = 该寄存器当前持有值的编号; 表达式 ek = op:vn[rs]:vn[rt].
  //   - MOVI rd,imm      -> vn[rd]=vnOf(MOVI,imm)
  //   - MOV rd,rs        -> vn[rd]=vn[rs]             (值传播, copy-prop 值流)
  //   - 运算 rd,rs,rt    -> vn[rd]=vnOf(op,vn[rs],vn[rt])
  //   - LOAD_OFF rd,off  -> 仅当函数无内存写 (safeLoadNum) 时 vn[rd]=vnOf(LOAD_OFF,off);
  //                         否则 vn[rd]=-1 (防 STORE_OFF 改变栈值后被误判为同值, 别名安全)
  // 跨块: IN_vn[b]   = 各 pred 块末 vn 交集 (每寄存器值编号须一致, 否则 -1)
  //       IN_avail[b]= 各 pred OUT_avail 交集 (ek+持有者须一致)
  //   两交集保证: 仅当所有路径都持有同值且同寄存器时, 才复用 -> 安全 (完全冗余消除子集;
  //   部分冗余的支配边界插入 PRE 因物理寄存器受限不在此实现).
  // 转发: 块内遇 ek 已可用且持有者 hr!=rd -> 替换为 MOV rd,hr, 由后续 copyProp 消除.
  // 复用 _rebuild 的字级重映射契约. 门控: _globalEnabled() (并入 -O1).
  //   DISABLE_GLOBAL 回落到仅局部 CSE (peepholeCSE).
  // =====================================================================
  _tacGCSE(seg){
    const code=seg.code, O=opcode;
    if(!code || code.length<2 || code[0]!==O.ENTER) return false;
    const a=tac.tacAnalyze(code, seg.labelTable);
    const cfg=a.cfg, ins=cfg.ins, n=ins.length;
    if(n===0) return false;
    // 安全闸门: 函数含内存写 (STORE_OFF/STOREB_OFF/STOREH_OFF/STORE/STOREB/STOREH) 时,
    // LOAD_OFF 不纳入值编号 (防止 STORE_OFF 改变栈值后被误判为同值).
    let hasMemWrite=false;
    for(const x of ins){
      const op=x.op;
      if(op===O.STORE_OFF||op===O.STOREB_OFF||op===O.STOREH_OFF||
         op===O.STORE||op===O.STOREB||op===O.STOREH){ hasMemWrite=true; break; }
    }
    const safeLoadNum = !hasMemWrite;
    // 值编号缓存 (本函数内单调; 同 (op,a,b) 同号 -> 跨块/跨路径值一致即编号一致)
    const vnCache=new Map(); let vnCounter=1;
    function vnOf(op,a,b){ const k=op+':'+a+':'+b; let v=vnCache.get(k); if(v===undefined){ v=vnCounter++; vnCache.set(k,v); } return v; }
    // 块内前向扫描: 返回 {avail, vn}. collect!=null 时记录冗余替换.
    function scan(b, IN_avail, IN_vn, collect){
      const avail=new Map(IN_avail);
      // 常量 commoning 仅块内生效: 不跨块传递 MOVI 持有者 (callee/acc 寄存器跨块值不可靠)
      for(const k of [...avail.keys()]) if(k.startsWith('MOVI:')) avail.delete(k);
      const vn = IN_vn ? IN_vn.slice() : new Array(8).fill(-1);
      for(let idx=b.startIns; idx<=b.endIns; idx++){
        const x=ins[idx], op=x.op, i=x.i;
        if(tac.isBarrier(op)){ avail.clear(); vn.fill(-1); continue; } // CALL/CALLR/SYS_CALL/RET/VB/VM_EXIT
        const d=tac.defsOf(op,i,code);                                 // def 寄存器数组
        const rd = (op>=0&&op<=31) ? code[i+1] : (d.length===1 ? d[0] : -1);
        // kill: 持有者∈d 或 操作数寄存器∈d 的元素失效 (旧值/值变了)
        if(d.length){
          for(const k of [...avail.keys()]){
            const e=avail.get(k);
            if(d.includes(e.hr)){ avail.delete(k); continue; }
            if(d.includes(e.opr0) || (e.opr1>=0 && d.includes(e.opr1))) avail.delete(k);
          }
        }
        if(op>=0&&op<=15){                       // ADD..GE rd,rs,rt
          const rs=code[i+2], rt=code[i+3];
          const av=vn[rs], bb=vn[rt];
          if(av>=0 && bb>=0){
            const ek=op+':'+av+':'+bb;
            if(avail.has(ek)){ const hr=avail.get(ek).hr; if(hr!==rd && collect) collect(idx,rd,hr); }
            avail.set(ek, {hr:rd, opr0:rs, opr1:rt});
          }
          vn[rd] = (av>=0&&bb>=0) ? vnOf(op,av,bb) : -1;
        } else if(op>=16&&op<=31){               // ADDI..GEI rd,rs,imm
          const rs=code[i+2], imm=code[i+3];
          const av=vn[rs];
          if(av>=0){
            const ek=op+':'+av+':'+imm;
            if(avail.has(ek)){ const hr=avail.get(ek).hr; if(hr!==rd && collect) collect(idx,rd,hr); }
            avail.set(ek, {hr:rd, opr0:rs, opr1:-1});
          }
          vn[rd] = (av>=0) ? vnOf(op,av,imm) : -1;
        } else if(op===O.MOV){
          const s=code[i+2];
          vn[rd] = (s>=0 && vn[s]>=0) ? vn[s] : -1;
          // 值传播: 该值经 MOV 从 s 移到 rd, 故 avail 中持有者==s 的条目更新为 rd
          for(const k of avail.keys()){ const e=avail.get(k); if(e.hr===s) e.hr=rd; }
        } else if(op===O.MOVI){
          const v=code[i+2];
          vn[rd] = vnOf(O.MOVI, v, -1);
          // 常量 commoning: 同一立即数的重复 MOVI 复用 (常量无副作用, 跨块安全)
          const ek='MOVI:'+v;
          if(avail.has(ek)){ const hr=avail.get(ek).hr; if(hr!==rd && collect) collect(idx,rd,hr); }
          avail.set(ek, {hr:rd, opr0:-1, opr1:-1});
        } else if(op===O.LOAD_OFF){
          vn[rd] = safeLoadNum ? vnOf(O.LOAD_OFF, code[i+2], -1) : -1;
        } else if(op===O.POP){
          vn[rd] = -1;                            // 栈弹出, 值未知
        } else if(rd>=0){
          vn[rd] = -1;                            // 其它纯写 (LOAD/LOADB/...): 值未知
        }
        // 其它指令 (JMP/JZ/PUSH/CMP/CMPI 等): 不改 vn, 不进 avail
      }
      return { avail, vn };
    }
    // 迭代算 OUT (空初始化 + 正向, 交集 meet, 安全收敛到不动点)
    const OUT=cfg.blocks.map(()=>({avail:new Map(), vn:new Array(8).fill(-1)}));
    let guard=0, changed=true;
    while(changed && guard++<300){
      changed=false;
      for(const b of cfg.blocks){
        let IN_avail=null;
        for(const p of b.pred){ const pm=OUT[p].avail;
          if(IN_avail===null) IN_avail=new Map(pm);
          else { for(const k of [...IN_avail.keys()]) if(!pm.has(k)) IN_avail.delete(k); }
        }
        if(IN_avail===null) IN_avail=new Map();
        const IN_vn=new Array(8).fill(-1);
        if(b.pred.size>0){
          let first=true;
          for(const p of b.pred){ const pv=OUT[p].vn;
            if(first){ for(let r=0;r<8;r++) IN_vn[r]=pv[r]; first=false; }
            else { for(let r=0;r<8;r++) if(IN_vn[r]!==pv[r]) IN_vn[r]=-1; }
          }
        }
        const res=scan(b, IN_avail, IN_vn, null);
        let same = res.avail.size===OUT[b.id].avail.size && res.vn.every((v,r)=>v===OUT[b.id].vn[r]);
        if(same) for(const [k,v] of res.avail){ const w=OUT[b.id].avail.get(k); if(!w||w.hr!==v.hr){ same=false; break; } }
        if(!same){ OUT[b.id]=res; changed=true; }
      }
    }
    // 最终一遍: 用收敛后的 OUT 算 IN, 收集冗余替换
    const instrs=ins.map(x=>({opc:x.op,i:x.i,len:x.len}));
    const keep=new Array(n).fill(true);
    const repl=new Array(n).fill(null);
    let didChange=false;
    for(const b of cfg.blocks){
      let IN_avail=null;
      for(const p of b.pred){ const pm=OUT[p].avail;
        if(IN_avail===null) IN_avail=new Map(pm);
        else { for(const k of [...IN_avail.keys()]) if(!pm.has(k)) IN_avail.delete(k); }
      }
      if(IN_avail===null) IN_avail=new Map();
      const IN_vn=new Array(8).fill(-1);
      if(b.pred.size>0){
        let first=true;
        for(const p of b.pred){ const pv=OUT[p].vn;
          if(first){ for(let r=0;r<8;r++) IN_vn[r]=pv[r]; first=false; }
          else { for(let r=0;r<8;r++) if(IN_vn[r]!==pv[r]) IN_vn[r]=-1; }
        }
      }
      scan(b, IN_avail, IN_vn, (idx,rd,hr)=>{ if(repl[idx]===null){ repl[idx]=[O.MOV,rd,hr]; didChange=true; } });
    }
    if(!didChange) return 0;
    this._rebuild(seg, instrs, keep, repl);
    return 1;
  }

  // =====================================================================
  // 过程间优化 #25: 调用图 + 保守 mod/ref 别名分析 + 小函数内联
  // ---------------------------------------------------------------------
  // 调用约定回顾 (详见 MEMORY 调研记录):
  //   * TAC 已是物理寄存器形式; 局部/参数优先分配到 callee-saved R4/R6/R7.
  //   * CALL=[CALL,0] (2 字); 经 callFixups[].symIdx -> sysboltable[].FuncId
  //     -> funcSegments[FuncId] 反查被调. 返回值恒在 R0=acc; 调用后 MOV dst,0 搬回.
  //   * leaf 函数有"双 LEAVE"尾 (首条生效, 第二条不可达死代码).
  // 内联安全模型 (保守, 保证 -O0 == -O1 逐字节一致):
  //   * 仅内联 leaf (无 CALL/CALLR/SYS_CALL/RET) + 单出口 (仅首条 LEAVE 可达)
  //     + 无内存访问 (无 *_OFF / LOAD / STORE / LEA, 见 mod/ref) + 形参<=4 的小函数.
  //   * callee 的 callee-saved 局部寄存器(R4/R6/R7)重命名到调用点可用的寄存器:
  //       - R1/R2/R3: 调用者保存, 跨调用必被杀伤, 安全重用 (但不得取作实参的 R0..R(n-1)
  //         以免踩踏尚未读入的实参, 且不得与 callee 体已用寄存器冲突避免合并生命期).
  //       - R4/R6/R7: 必须 dead-at-call (liveOut 补集), 否则 caller 依赖其跨调用存活.
  //   * 形参经 prologue MOV(calleeReg, argReg=R0..R3) 载入; 调用点实参已在 R0..R3,
  //     重命名后该 MOV 变 MOV(targetReg, argReg), target 不取 argReg 故无踩踏.
  //   * 末尾 LEAVE 丢弃: callee 返回值恒在 R0, 调用点后续 MOV dst,0 自然捕获.
  //   * callee 内部跳转(label)重映射到 caller 全新 labelId 并注入 labelTable.
  // 由 _globalEnabled() 门控 (并入 -O1); DISABLE_GLOBAL 回落关闭.
  // =====================================================================

  // 构建调用图: callerFuncId -> Set(calleeFuncId); 并标记含间接调用的函数.
  _tacCallGraph(){
    const cg = new Map();      // funcId -> Set(calleeFuncId)
    const indirect = new Set();// 含 CALLR 的函数 funcId
    const segOf = this.funcSegments;
    for(let fid=0; fid<segOf.length; fid++){
      const seg = segOf[fid];
      if(!seg || !seg.callFixups) continue;
      let set = cg.get(fid);
      for(const fx of seg.callFixups){
        const sym = this.sysboltable ? this.sysboltable[fx.symIdx] : null;
        if(sym && sym.FuncId>=0 && sym.FuncId<segOf.length){
          if(!set){ set=new Set(); cg.set(fid,set); }
          set.add(sym.FuncId);
        }
      }
    }
    for(let fid=0; fid<segOf.length; fid++){
      const seg=segOf[fid]; if(!seg) continue;
      const all=tac.decode(seg.code);
      for(const x of all) if(x.op===opcode.CALLR) indirect.add(fid);
    }
    return { cg, indirect };
  }

  // 保守 mod/ref 别名分析: funcId -> {mod:Set, ref:Set, hasMem:bool, leaf:bool}
  //   mod/ref 元素: 整字 *_OFF 槽偏移(数字) / 特殊标记 'mem'(计算地址访存 LOAD/STORE*)
  //     / 'any'(含调用, 视为可能改/引用一切). 保守: 含 STORE*/CALL/CALLR/SYS_CALL -> mod 'any';
  //   含 LOAD*(除 *_OFF)/CALL -> ref 'any'.
  _tacModRef(){
    const res = new Map();
    for(let fid=0; fid<this.funcSegments.length; fid++){
      const seg=this.funcSegments[fid];
      if(!seg){ res.set(fid,{mod:new Set(),ref:new Set(),hasMem:false,leaf:true}); continue; }
      const mod=new Set(), ref=new Set(); let hasMem=false, leaf=true;
      const all=tac.decode(seg.code);
      for(const x of all){
        const op=x.op, code=seg.code;
        if(op===opcode.CALL||op===opcode.CALLR||op===opcode.SYS_CALL){ leaf=false; mod.add('any'); ref.add('any'); continue; }
        if(op===opcode.RET||op===opcode.VM_EXIT) continue;
        if(op===opcode.LOAD_OFF||op===opcode.LOADB_OFF||op===opcode.LOADH_OFF){ ref.add(code[x.i+2]); hasMem=true; }
        else if(op===opcode.STORE_OFF||op===opcode.STOREB_OFF||op===opcode.STOREH_OFF){ mod.add(code[x.i+2]); hasMem=true; }
        else if(op===opcode.LOAD||op===opcode.LOADB||op===opcode.LOADH){ ref.add('mem'); hasMem=true; }
        else if(op===opcode.STORE||op===opcode.STOREB||op===opcode.STOREH){ mod.add('mem'); hasMem=true; }
        else if(op===opcode.LEA){ hasMem=true; ref.add('mem'); }
      }
      res.set(fid,{mod,ref,hasMem,leaf});
    }
    return res;
  }

  // 小函数内联: 在 seg 内对所有直接调用点尝试内联 callee.
  //   aggressive=false (默认 -O1/-O2/-O3): 仅内联 leaf / 单出口 / 无内存 / 小函数(≤16指令),
  //     寄存器不够则放弃 (不膨胀).
  //   aggressive=true (-O4 最大速度): 额外允许 多出口 (各 LEAVE→JMP 汇合点) +
  //     寄存器溢出 (callee-saved 局部过多时用 PUSH/POP 包裹而非放弃) + 大函数(≤64指令).
  //   两模式均拒绝 含内存访问(LOAD_OFF/STORE_OFF 等, 会踩 caller 帧) 与 非 leaf(含内部 CALL) 的 callee.
  //   -O5 (最小体积) 不调用本函数 (见 peephole 门控).
  // 复用字级重映射契约; callee 内部 label 重映射到 caller 新 labelId; 多出口汇合点用新 postLabel.
  _tacInline(seg, aggressive){
    const O=opcode;
    if(!seg.code || seg.code.length<2 || seg.code[0]!==O.ENTER) return false;
    if(!seg.callFixups || seg.callFixups.length===0) return false;
    const sys=this.sysboltable;
    if(!sys) return false;

    const mr=this._tacModRef();
    const { cg } = this._tacCallGraph();

    const ins = tac.decode(seg.code);            // 调用者指令 (按起始字索引)
    const callSites=[];
    for(let k=0;k<ins.length;k++){
      const x=ins[k];
      if(x.op!==O.CALL) continue;
      const fx = seg.callFixups.find(f=>(f.pos>>2)===x.i);
      if(!fx) continue;
      const sym=sys[fx.symIdx];
      if(!sym || sym.FuncId<0 || sym.FuncId>=this.funcSegments.length) continue;
      callSites.push({k, wpos:x.i, fx, calleeFid:sym.FuncId});
    }
    if(callSites.length===0) return false;

    // 预分析每个被调 callee: 仅识别"直通式转发包装"(forwarder), 形如 writedata(d){ spirw(d); }
    //   body = [MOV/MOVI/LDA 传参] + 恰好一个 CALL(转发目标) + LEAVE, 单出口、无内存/无分支/无算术.
    //   内联此类函数 = 把被调函数直接暴露给调用者 (等价把 spirw 重命名为 writedata), 省掉一层包装调用.
    //   其余小函数(如 rstdelay 这类含真实循环体的)不再内联, 保留为独立函数被 BL 调用, 避免代码膨胀.
    //   注: forwarder 含内部 CALL, 故下方调用点须绕过 leaf / no-mem 门控, 并在重排后补一条内层 callFixup.
    const calleeCache=new Map();
    const MAX_BODY=aggressive?64:16;
    const analyzeCallee=(fid)=>{
      if(calleeCache.has(fid)) return calleeCache.get(fid);
      const cseg=this.funcSegments[fid];
      let info={ok:false};
      if(cseg && cseg.code && cseg.code[0]===O.ENTER){
        const cins=tac.decode(cseg.code);
        let firstLeave=-1;
        for(let j=1;j<cins.length;j++){ if(cins[j].op===O.LEAVE){ firstLeave=j; break; } }
        if(firstLeave>0){
          let multiExit=false;
          for(let j=firstLeave+1;j<cins.length;j++){ if(cins[j].op!==O.LEAVE){ multiExit=true; break; } }
          const leaves=[];
          for(let j=1;j<cins.length;j++){ if(cins[j].op===O.LEAVE) leaves.push(j); }
          const lastLeave = multiExit ? leaves[leaves.length-1] : firstLeave;
          const body=cins.slice(1, lastLeave+1);   // 含所有可达 LEAVE (末条之后不可达, 丢弃)
          if(!multiExit){
            // 纯转发包装形状校验
            let fwdOk=true, callCnt=0, innerCallIdx=-1, targetFid=-1, targetSymIdx=-1;
            for(const bi of body){
              const o=bi.op;
              if(o===O.CALL||o===O.CALLR||o===O.SYS_CALL){
                callCnt++;
                if(callCnt>1){ fwdOk=false; break; }       // 至多一个内部调用
                const cfx = cseg.callFixups && cseg.callFixups.find(f=>(f.pos>>2)===bi.i);
                if(!cfx){ fwdOk=false; break; }
                const csym = sys[cfx.symIdx];
                if(!csym || csym.FuncId<0 || csym.FuncId>=this.funcSegments.length || csym.FuncId===fid){ fwdOk=false; break; } // 拒绝递归
                innerCallIdx=bi.i; targetFid=csym.FuncId; targetSymIdx=cfx.symIdx;
              } else if(o===O.MOV||o===O.MOVI||o===O.LDA||o===O.NOP){
                // 允许: 传参 MOV / 立即数 / 取址 / 空操作
              } else if(o===O.LEAVE){
                // 末尾返回
              } else {
                fwdOk=false; break;   // 任何其它指令(算术/分支/内存/比较) → 不是纯转发包装
              }
            }
            const paramCount=(cseg && typeof cseg.paramCount==='number') ? cseg.paramCount : 4;
            if(fwdOk && callCnt===1 && paramCount<=4 && (body.length-1)<=MAX_BODY){
              const usedRegs=new Set();
              for(const bi of body){
                const d=tac.defsOf(bi.op,bi.i,cseg.code), u=tac.usesOf(bi.op,bi.i,cseg.code);
                for(const r of d) usedRegs.add(r);
                for(const r of u) usedRegs.add(r);
              }
              const csUsed=new Set([...usedRegs].filter(r=>(r===4||r===6||r===7)));
              info={ok:true, forward:true, body, csUsed, usedRegs, multiExit:false,
                    innerCallIdx, targetFid, targetSymIdx};
            }
          }
        }
      }
      calleeCache.set(fid, info);
      return info;
    };

    // 调用者活性 (dead-at-call)
    const a=tac.tacAnalyze(seg.code, seg.labelTable);
    const blockOfIns=new Map();
    for(const b of a.cfg.blocks) for(let idx=b.startIns; idx<=b.endIns; idx++) blockOfIns.set(idx,b.id);
    const deadAtCall=(callInsIdx)=>{
      // 指令级精确活性: 从块末 liveOut 反向回推到调用点之后 (含调用点之后同块内的使用).
      // 仅用块级 liveOut 会漏掉 "调用后同块内使用" 的寄存器 (误判 dead → 内联体踩踏).
      const bid=blockOfIns.get(callInsIdx);
      const dead=new Set();
      if(bid===undefined) return dead; // 未知块: 保守返回空集 (全部视为 live)
      const blk=a.cfg.blocks[bid];
      const live=new Set(a.liveness.liveOutBlock.get(bid)||[]);
      for(let idx=blk.endIns; idx>callInsIdx; idx--){
        const x=a.cfg.ins[idx];
        for(const r of tac.defsOf(x.op,x.i,seg.code)) live.delete(r);
        for(const r of tac.usesOf(x.op,x.i,seg.code)) live.add(r);
      }
      for(let r=0;r<=7;r++){ if(r===0||r===5) continue; if(!live.has(r)) dead.add(r); }
      return dead;
    };

    // 收集替换计划
    let maxLabel=-1;
    if(seg.labelTable) for(const k in seg.labelTable) maxLabel=Math.max(maxLabel, +k);
    const plans=[];
    for(const cs of callSites){
      // 内联门控收紧: 只内联"直通式转发包装"(forwarder)。其余小函数(含真实循环体的 rstdelay 等)
      // 不再内联, 以免复制膨胀。forwarder 本身含内部 CALL, 故此处不做 leaf / no-mem 门控。
      const info=analyzeCallee(cs.calleeFid);
      if(!info.ok) continue;
      const cseg=this.funcSegments[cs.calleeFid];
      const paramCount=(cseg && typeof cseg.paramCount==='number') ? cseg.paramCount : 4;
      if(paramCount>4) continue;                  // 含栈上传参 -> 保守跳过
      const dead=deadAtCall(cs.k);
      const argRegs=new Set(); for(let p=0;p<paramCount;p++) argRegs.add(p);
      // 候选目标池: 空闲 caller-saved(R1/R2/R3) + dead-at-call 的 callee-saved(R4/R6/R7, 可安全踩).
      // 与保守模式原映射顺序一致 (先 R1/R2/R3 后 R4/R6/R7), 保证 -O1/-O2/-O3 结果不变.
      const pool=[];
      for(const r of [1,2,3]){
        if(info.usedRegs.has(r)) continue;
        if(argRegs.has(r)) continue;
        if(!dead.has(r)) continue; // 调用点后仍存活 (如实参暂存/优化残留) → 不可踩
        pool.push(r);
      }
      // callee-saved 目标寄存器: dead-at-call 之外还须已在 caller ENTER mask 中 (序言已保存)——
      // 否则内联体踩了 caller 未保存的 R4/R6/R7, 会破坏 caller 的调用者.
      const callerMask=(seg.code[1]>>8)&0xFF;
      for(const r of [4,6,7]){
        if(!dead.has(r)) continue;
        if(!(callerMask&(1<<r))) continue;
        if(info.usedRegs.has(r)) continue;
        pool.push(r);
      }
      const csList=[...info.csUsed];
      const map=new Map();
      const wrapList=[];
      if(csList.length<=pool.length){
        for(let i=0;i<csList.length;i++) map.set(csList[i], pool[i]);
      } else if(aggressive){
        // 寄存器不够: 激进模式用 PUSH/POP 包裹多余 callee-saved 局部 (保留 caller 原值)
        for(let i=0;i<pool.length;i++) map.set(csList[i], pool[i]);
        for(let i=pool.length;i<csList.length;i++) wrapList.push(csList[i]);
      } else {
        continue; // 保守: 寄存器不够 -> 跳过(不膨胀)
      }

      // 确保 maxLabel 超过 caller 与 callee 的已有 label id, 避免 postLabel 与 callee 原 label 的数值 id 冲突
      let cmax=-1;
      if(seg.labelTable) for(const k in seg.labelTable) cmax=Math.max(cmax,+k);
      if(cseg.labelTable) for(const k in cseg.labelTable) cmax=Math.max(cmax,+k);
      if(cmax>maxLabel) maxLabel=cmax;

      // callee 内部 label 重映射
      const calleeLabels=new Set();
      if(cseg.labelTable){
        const b0=info.body[0].i, bl=info.body[info.body.length-1], b1=bl.i+bl.len;
        for(const lid in cseg.labelTable){
          const wp=cseg.labelTable[lid];
          if(wp>=b0 && wp<b1) calleeLabels.add(+lid);
        }
      }
      const refLabels=new Set();
      for(const bi of info.body){
        let tww=-1;
        if(bi.op===O.JMP) tww=bi.i+1;
        else if(bi.op===O.JZ||bi.op===O.JNZ) tww=bi.i+2;
        else if(bi.op>=O.JEQ&&bi.op<=O.JGE) tww=bi.i+1;
        if(tww>=0){ const v=cseg.code[tww]; if(v<0) refLabels.add(-v); }
      }
      const needLabels=new Set([...calleeLabels].filter(l=>refLabels.has(l)));
      const labelMap=new Map();
      for(const l of needLabels){
        const wp=cseg.labelTable[l];
        const offInBody=wp-info.body[0].i;
        maxLabel++;
        labelMap.set(l,{newId:maxLabel, offInBody});
      }

      // 多出口 / 溢出包裹 需要一个汇合点: 所有 LEAVE/JMP 汇聚于此, 在此恢复被包裹的寄存器
      const needPost = info.multiExit || wrapList.length>0;
      let postLabel=-1;
      if(needPost){ maxLabel++; postLabel=maxLabel; }

      // 生成内联体 (PUSH 包裹 + 重命名 + label 重映射 + LEAVE→JMP(postLabel) + POP 包裹)
      const inlineWords=[];
      let innerCallWordOff=-1;   // forwarder 内层 CALL 在 inlineWords 中的字偏移 (供补 callFixup)
      for(const r of wrapList){ inlineWords.push(O.PUSH, r); }   // 保存 caller 的 callee-saved 局部
      for(const bi of info.body){
        const op=bi.op;
        if(op===O.CALL||op===O.CALLR||op===O.SYS_CALL) innerCallWordOff=inlineWords.length;
        if(op===O.LEAVE){
          if(info.multiExit){ inlineWords.push(O.JMP, -postLabel); } // 多出口: 跳到汇合点; 单出口直接 fall-through
          continue;
        }
        const words=cseg.code.slice(bi.i, bi.i+bi.len).slice();
        const rename=(pos)=>{ const r=words[pos]; if(map.has(r)) words[pos]=map.get(r); };
        if(op>=0&&op<=31||op===O.BIC){ rename(1); rename(2); rename(3); }
        else if(op===O.MOV||op===O.MOVI||op===O.LDA||op===O.LEA){ rename(1); if(op===O.MOV) rename(2); }
        else if(op===O.LOAD_OFF||op===O.STORE_OFF||op===O.LOADB_OFF||op===O.STOREH_OFF||op===O.STOREB_OFF){ rename(1); rename(2); }
        else if(op===O.LOAD||op===O.STORE||op===O.LOADB||op===O.STOREB||op===O.LOADH||op===O.STOREH){ rename(1); rename(2); }
        else if(op===O.CMP){ rename(1); rename(2); }
        else if(op===O.CMPI){ rename(1); }
        else if(op===O.PUSH){ rename(1); }
        else if(op===O.POP){ rename(1); }
        else if(op===O.JZ||op===O.JNZ){ rename(1); }
        let tww=-1;
        if(op===O.JMP) tww=1;
        else if(op===O.JZ||op===O.JNZ) tww=2;
        else if(op>=O.JEQ&&op<=O.JGE) tww=1;
        if(tww>=0 && words[tww]<0){
          const lm=labelMap.get(-words[tww]);
          if(lm) words[tww]=-lm.newId;
        }
        for(const w of words) inlineWords.push(w);
      }
      const postPos=inlineWords.length;            // 汇合点位置 (多出口 JMP / POP 落点)
      for(const r of wrapList){ inlineWords.push(O.POP, r); }    // 恢复 caller 的 callee-saved 局部

      // 把 postLabel 并入 labelMap, 使其随 callee label 一起注入 newLabelTable
      if(needPost) labelMap.set(postLabel, {newId:postLabel, offInBody:postPos});
      plans.push({k:cs.k, wpos:cs.wpos, fx:cs.fx, inlineWords, labelMap,
                  forward:!!info.forward, innerCallWordOff, targetSymIdx:info.targetSymIdx});
    }
    if(plans.length===0) return false;

    // —— 重建调用者代码: 在调用点拼接内联体, 注入新 label, 删除对应 callFixup ——
    const code=seg.code;
    const hasColors=Array.isArray(seg.colors)||ArrayBuffer.isView(seg.colors);
    const newCode=[]; const newColors=hasColors?[]:null;
    const remap=new Map();
    const droppedFixupPos=new Set(plans.map(p=>p.wpos));
    const planByK=new Map(plans.map(p=>[p.k,p]));
    const newLabelTable = seg.labelTable ? Object.assign({}, seg.labelTable) : {};
    let i=0;
    while(i<ins.length){
      const cur=ins[i];
      if(planByK.has(i)){
        const p=planByK.get(i);
        const base=newCode.length;
        p._base=base;   // 记录内联体起点, 供事后注入 label
        for(let j=0;j<p.inlineWords.length;j++){
          newCode.push(p.inlineWords[j]);
          if(newColors) newColors.push(0);
        }
        for(let j=0;j<cur.len;j++){
          const tgt=base+Math.min(j, p.inlineWords.length-1);
          remap.set(cur.i+j, tgt);
        }
        i++; continue;
      }
      const base=newCode.length;
      for(let j=0;j<cur.len;j++){
        remap.set(cur.i+j, base+j);
        newCode.push(code[cur.i+j]);
        if(newColors) newColors.push(hasColors?(seg.colors[cur.i+j]||0):0);
      }
      i++;
    }
    remap.set(code.length, newCode.length); // 段末哨兵
    // 先重映射 caller 原有 label (仍是旧字索引) — 仅这些需经 remap
    for(const k in newLabelTable){ const nv=remap.get(newLabelTable[k]); if(nv!==undefined) newLabelTable[k]=nv; }
    // 再注入 callee / postLabel (已是新字索引, 绝不再经 remap, 否则会把新索引误当旧索引重映射).
    // 注意: labelMap 的 key 是原 callee labelId, 但 inlineWords 内的跳转引用的是重映射后的 newId;
    //       必须以 lm.newId 作 key 注入 newLabelTable, 否则 Jcc/JMP 解析会找不到目标 (默认落到字 0 → 死循环).
    for(const p of plans){ for(const [lid, lm] of p.labelMap) newLabelTable[lm.newId]=p._base+lm.offInBody; }
    if(seg.callFixups){
      const newFix=[];
      for(const fx of seg.callFixups){
        if(droppedFixupPos.has(fx.pos>>2)) continue;
        const nw=remap.get(fx.pos>>2);
        if(nw!==undefined) newFix.push({pos:nw<<2, symIdx:fx.symIdx});
      }
      // forwarder 内联: 外层 writedata 调用已被删除(落入 droppedFixupPos),
      // 需补一条内层 spirw 调用的 callFixup, 使最终链接指向真正的被调函数。
      for(const p of plans){
        if(p.forward && p.innerCallWordOff>=0){
          const nw=p._base + p.innerCallWordOff;
          newFix.push({pos:nw<<2, symIdx:p.targetSymIdx});
        }
      }
      seg.callFixups=newFix;
    }
    if(this.funcAddrFixups){ for(const fx of this.funcAddrFixups){ if(fx.segIdx===seg.funcId){ const nw=remap.get(fx.wordPos); if(nw!==undefined) fx.wordPos=nw; } } }
    if(this.srcLineMap) this._remapSrcLineMap(seg, remap);
    seg.code=newCode;
    if(newColors) seg.colors=newColors;
    seg.labelTable=newLabelTable;
    seg.length=newCode.length*4;
    return true;
  }

  // ---- 全局寄存器分配: 统一干涉图着色 ----
  // "最大收益" 版本 — 对 栈槽 + 寄存器变量 做统一评估,
  // 主动回收编译期分配的低价值 callee-saved 寄存器给高频栈槽.
  //
  // 核心思想: 栈槽和寄存器变量竞争相同的 callee-saved 寄存器.
  // 统一评估所有候选变量的访问频率, 用图着色决定谁该得寄存器.
  //
  // 步骤:
  //   1. 扫描: 收集栈槽信息 + 寄存器变量信息 + CALL 位置
  //   2. 统一候选列表: 栈槽 + 低价值寄存器变量 (已占用 callee-saved)
  //   3. 干涉图构建 (对栈槽: 据活区间; 对寄存器变量: 不干涉其他)
  //   4. 贪心着色 + 回收决策: 用图着色决定分配
  //   5. 执行: promote 栈槽 (LOAD_OFF→MOV), demote 寄存器变量 (MOV→LOAD_OFF)
  //   6. 更新 ENTER/LEAVE
  //
  // 替换规则 (始终 3 字→3 字):
  //   LOAD_OFF rd, slot  →  MOV rd, reg   (promote 栈槽到寄存器)
  //   STORE_OFF slot, rs →  MOV reg, rs   (promote)
  //   MOV reg, rs        →  STORE_OFF slot, rs  (demote 寄存器变量到栈)
  //   MOV rd, reg        →  LOAD_OFF rd, slot   (demote)

  finalizeLayout(){
    if(this.funcSegments.length===0)return;
    // 先解析标签 (在段内将 -labelId → 段内字节偏移)
    this.resolveLabels();
    let base=0;
    for(const seg of this.funcSegments){
      seg.baseAddr=base;base+=seg.length;
    }
    const totalWords=base/4;
    this.code=new Array(totalWords);this.ip=totalWords-1;
    this._tacColors=new Uint8Array(totalWords);
    for(const seg of this.funcSegments){
      if(seg.length===0) continue;  // 已剔除的默认中断桩: 不生成机器码
      const baseIdx=seg.baseAddr/4;
      for(let i=0;i<seg.code.length;i++){
        this.code[baseIdx+i]=seg.code[i];
        this._tacColors[baseIdx+i]=(seg.colors&&seg.colors[i])||0;
      }
      // 修复 JMP/Jcc/JZ/JNZ/CALL 目标地址 (段内偏移 → 全局绝对地址)
      for(let i=0;i<seg.code.length;){
        const opc=seg.code[i];
        if(opc===59){this.code[baseIdx+i+1]=seg.code[i+1]+seg.baseAddr;i+=2;}
        else if(opc>=42&&opc<=47){this.code[baseIdx+i+1]=seg.code[i+1]+seg.baseAddr;i+=2;}
        else if(opc===60||opc===61){this.code[baseIdx+i+2]=seg.code[i+2]+seg.baseAddr;i+=3;}
        else i+=instrLen(opc);
      }
      // CALL 修复由 resolveCallFixups 在 finalizeLayout 后处理
    }
  }
  save(filename){
    const buf=Buffer.alloc(this.code.length*4);
    for(let i=0;i<this.code.length;i++)buf.writeInt32LE(this.code[i],i*4);
    if (fs) fs.writeFileSync(filename,buf);
    else throw new Error('save() 需要 fs 模块（浏览器环境下不可用）');
  }

  run(addr,argv,c,trace){
    if(!argv)argv=[];const R=new Int32Array(8);let sp,bp;let pc=addr;let cyc;
    bp=sp=(c.Intdata.length-1)*4;
    this.emit(opcode.NOP);const exitAddr=this.here();this.emit(opcode.VM_EXIT);
    sp-=4;c.Intdata[sp>>2]=argv.length;
    const point=new Array(argv.length);for(let i=0;i<argv.length;i++)point[i]=c.fillrwdata_str(argv[i]);
    sp-=4;c.Intdata[sp>>2]=c.datapos;sp-=4;c.Intdata[sp>>2]=exitAddr;
    for(let i=0;i<argv.length;i++)c.fillrwdata_int(point[i]);
    cyc=0;const MAX_CYC=5000000;
    // 操作码名称映射
    const oname={
      0:'ADD',1:'SUB',2:'MUL',3:'DIV',4:'MOD',
      5:'OR',6:'XOR',7:'AND',8:'SHL',9:'SHR',32:'BIC',
      10:'EQ',11:'NE',12:'LT',13:'GT',14:'LE',15:'GE',
      16:'ADDI',17:'SUBI',18:'MULI',19:'DIVI',20:'MODI',
      21:'ORI',22:'XORI',23:'ANDI',24:'SHLI',25:'SHRI',
      26:'EQI',27:'NEI',28:'LTI',29:'GTI',30:'LEI',31:'GEI',
      40:'CMP',41:'CMPI',
      42:'JEQ',43:'JNE',44:'JLT',45:'JGT',46:'JLE',47:'JGE',
      48:'LOAD_OFF',49:'STORE_OFF',
      71:'LOADB_OFF',72:'LOADH_OFF',73:'STOREB_OFF',74:'STOREH_OFF',
      50:'LOAD',51:'LOADB',68:'LOADH',
      52:'STORE',53:'STOREB',69:'STOREH',
      54:'LEA',      55:'MOVI',56:'MOV',
      70:'LDA',
      57:'PUSH',58:'POP',
      59:'JMP',60:'JZ',61:'JNZ',62:'CALL',
      63:'RET',64:'ENTER',65:'LEAVE',66:'ADJ',67:'NOP',68:'LOADH',
      80:'SYS_CALL',89:'VM_EXIT',
      90:'CALLR'
    };
    const Rold=new Int32Array(8);
    let changeStr='';
    function resetChange(){changeStr='';}
    function addReg(i){if(R[i]!==Rold[i]){if(changeStr)changeStr+=',';changeStr+=`R${i}:${Rold[i]}->${R[i]}`;Rold[i]=R[i];}}
    function addMem(addr,oldV,newV){if(changeStr)changeStr+=',';changeStr+=`MEM[${addr}]:${oldV}->${newV}`;}
    function flushChange(prefix){
      if(!trace)return;
      if(trace===1&&!changeStr)return;
      if(trace===2){
        if(prefix)console.log(`[${cyc}] ${prefix}`);
        if(changeStr)console.log(`  ${changeStr}`);
      }else{
        if(changeStr)console.log(`[${cyc}] ${changeStr}`);
      }
      changeStr='';
    }
    function saveRs(){if(trace)for(let i=0;i<8;i++)Rold[i]=R[i];}
    while(cyc<MAX_CYC){
      const mcode=this.code[pc>>2];pc+=4;cyc++;
      saveRs();
      let extra='';
      switch(mcode){
        case opcode.ADD:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]+R[rt];extra=`${oname[mcode]} r${rd}=r${rs}+r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.SUB:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]-R[rt];extra=`${oname[mcode]} r${rd}=r${rs}-r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.MUL:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]*R[rt];extra=`${oname[mcode]} r${rd}=r${rs}*r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.DIV:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=Math.trunc(R[rs]/R[rt]);extra=`${oname[mcode]} r${rd}=r${rs}/r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.MOD:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]%R[rt];extra=`${oname[mcode]} r${rd}=r${rs}%r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.OR:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]|R[rt];extra=`${oname[mcode]} r${rd}=r${rs}|r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.XOR:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]^R[rt];extra=`${oname[mcode]} r${rd}=r${rs}^r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.AND:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]&R[rt];extra=`${oname[mcode]} r${rd}=r${rs}&r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.BIC:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]&~R[rt];extra=`${oname[mcode]} r${rd}=r${rs}&~r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.SHL:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]<<R[rt];extra=`${oname[mcode]} r${rd}=r${rs}<<r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.SHR:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=R[rs]>>R[rt];extra=`${oname[mcode]} r${rd}=r${rs}>>r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.EQ:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=(R[rs]===R[rt])?1:0;extra=`${oname[mcode]} r${rd}=r${rs}==r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.NE:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=(R[rs]!==R[rt])?1:0;extra=`${oname[mcode]} r${rd}=r${rs}!=r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.LT:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=(R[rs]<R[rt])?1:0;extra=`${oname[mcode]} r${rd}=r${rs}<r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.GT:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=(R[rs]>R[rt])?1:0;extra=`${oname[mcode]} r${rd}=r${rs}>r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.LE:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=(R[rs]<=R[rt])?1:0;extra=`${oname[mcode]} r${rd}=r${rs}<=r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.GE:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;R[rd]=(R[rs]>=R[rt])?1:0;extra=`${oname[mcode]} r${rd}=r${rs}>=r${rt}`;addReg(rd);flushChange(extra);break;}
        case opcode.ADDI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]+i;extra=`${oname[mcode]} r${rd}=r${rs}+${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.SUBI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]-i;extra=`${oname[mcode]} r${rd}=r${rs}-${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.MULI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]*i;extra=`${oname[mcode]} r${rd}=r${rs}*${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.DIVI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=Math.trunc(R[rs]/i);extra=`${oname[mcode]} r${rd}=r${rs}/${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.MODI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]%i;extra=`${oname[mcode]} r${rd}=r${rs}%${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.ORI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]|i;extra=`${oname[mcode]} r${rd}=r${rs}|${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.XORI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]^i;extra=`${oname[mcode]} r${rd}=r${rs}^${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.ANDI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]&i;extra=`${oname[mcode]} r${rd}=r${rs}&${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.SHLI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]<<i;extra=`${oname[mcode]} r${rd}=r${rs}<<${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.SHRI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=R[rs]>>i;extra=`${oname[mcode]} r${rd}=r${rs}>>${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.EQI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=(R[rs]===i)?1:0;extra=`${oname[mcode]} r${rd}=r${rs}==${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.NEI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=(R[rs]!==i)?1:0;extra=`${oname[mcode]} r${rd}=r${rs}!=${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.LTI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=(R[rs]<i)?1:0;extra=`${oname[mcode]} r${rd}=r${rs}<${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.GTI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=(R[rs]>i)?1:0;extra=`${oname[mcode]} r${rd}=r${rs}>${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.LEI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=(R[rs]<=i)?1:0;extra=`${oname[mcode]} r${rd}=r${rs}<=${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.GEI:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=(R[rs]>=i)?1:0;extra=`${oname[mcode]} r${rd}=r${rs}>=${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.LOAD:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;R[rd]=c.Intdata[R[rs]>>2];extra=`${oname[mcode]} r${rd}=MEM[r${rs}=${R[rs]}]=${R[rd]}`;addReg(rd);flushChange(extra);break;}
        case opcode.LOAD_OFF:{const rd=this.code[pc>>2];pc+=4;const off=this.code[pc>>2];pc+=4;const addr=bp+off*4;R[rd]=c.Intdata[addr>>2];extra=`${oname[mcode]} r${rd}=BP[${off*4}]=${R[rd]}`;addReg(rd);flushChange(extra);break;}
        case opcode.LOADB_OFF:{const rd=this.code[pc>>2];pc+=4;const off=this.code[pc>>2];pc+=4;R[rd]=c.data[bp+off*4];extra=`${oname[mcode]} r${rd}=BPB[${off*4}]=${R[rd]}`;addReg(rd);flushChange(extra);break;}
        case opcode.LOADH_OFF:{const rd=this.code[pc>>2];pc+=4;const off=this.code[pc>>2];pc+=4;const a=bp+off*4;R[rd]=(c.data[a]|(c.data[a+1]<<8))<<16>>16;extra=`${oname[mcode]} r${rd}=BPH[${off*4}]=${R[rd]}`;addReg(rd);flushChange(extra);break;}
        case opcode.STORE_OFF:{const off=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const addr=bp+off*4;const oldV=c.Intdata[addr>>2];c.Intdata[addr>>2]=R[rs];extra=`${oname[mcode]} BP[${off*4}]=r${rs}=${R[rs]}`;addMem(addr,oldV,R[rs]);flushChange(extra);break;}
        case opcode.STOREB_OFF:{const off=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const a=bp+off*4;const oldV=c.data[a];c.data[a]=R[rs]&0xFF;extra=`${oname[mcode]} BPB[${off*4}]=r${rs}=${R[rs]&0xFF}`;addMem(a,oldV,R[rs]&0xFF);flushChange(extra);break;}
        case opcode.STOREH_OFF:{const off=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const a=bp+off*4;const oldV=c.data[a]|(c.data[a+1]<<8);c.data[a]=R[rs]&0xFF;c.data[a+1]=(R[rs]>>8)&0xFF;extra=`${oname[mcode]} BPH[${off*4}]=r${rs}=${R[rs]&0xFFFF}`;addMem(a,oldV,R[rs]&0xFFFF);flushChange(extra);break;}
        case opcode.LOADB:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;R[rd]=c.data[R[rs]];extra=`${oname[mcode]} r${rd}=MEMB[r${rs}=${R[rs]}]=${R[rd]}`;addReg(rd);flushChange(extra);break;}
        case opcode.LOADH:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;R[rd]=(c.data[R[rs]]|(c.data[R[rs]+1]<<8))<<16>>16;extra=`${oname[mcode]} r${rd}=MEMH[r${rs}=${R[rs]}]=${R[rd]}`;addReg(rd);flushChange(extra);break;}
        case opcode.STORE:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const addr=R[rd];const oldV=c.Intdata[addr>>2];c.Intdata[addr>>2]=R[rs];extra=`${oname[mcode]} MEM[${addr}] = r${rs}=${R[rs]}`;addMem(addr,oldV,R[rs]);flushChange(extra);break;}
        case opcode.STOREB:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const a=R[rd];const oldV=c.data[a];c.data[a]=R[rs]&0xFF;extra=`${oname[mcode]} MEMB[${a}] = r${rs}=${R[rs]&0xFF}`;addMem(a,oldV,R[rs]&0xFF);flushChange(extra);break;}
        case opcode.STOREH:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;const a=R[rd];const oldV=c.data[a]|(c.data[a+1]<<8);c.data[a]=R[rs]&0xFF;c.data[a+1]=(R[rs]>>8)&0xFF;extra=`${oname[mcode]} MEMH[${a}] = r${rs}=${R[rs]&0xFFFF}`;addMem(a,oldV,R[rs]&0xFFFF);flushChange(extra);break;}
        case opcode.LEA:{const rd=this.code[pc>>2];pc+=4;const off=this.code[pc>>2];pc+=4;R[rd]=bp+off*4;extra=`${oname[mcode]} r${rd}=bp${off>=0?'+':''}${off*4}=${R[rd]}`;addReg(rd);flushChange(extra);break;}
        case opcode.MOVI:{const rd=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=i;extra=`${oname[mcode]} r${rd}=${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.LDA:{const rd=this.code[pc>>2];pc+=4;const i=this.code[pc>>2];pc+=4;R[rd]=i;extra=`${oname[mcode]} r${rd}=${i}`;addReg(rd);flushChange(extra);break;}
        case opcode.MOV:{const rd=this.code[pc>>2];pc+=4;const rs=this.code[pc>>2];pc+=4;R[rd]=R[rs];extra=`${oname[mcode]} r${rd}=r${rs}=${R[rs]}`;addReg(rd);flushChange(extra);break;}
        case opcode.PUSH:{const rd=this.code[pc>>2];pc+=4;sp-=4;c.Intdata[sp>>2]=R[rd];extra=`${oname[mcode]} r${rd}=${R[rd]} sp->${sp}`;addReg(0);addReg(1);addReg(2);addReg(3);addReg(4);addReg(5);addReg(6);addReg(7);addMem(sp,R[rd],R[rd]);flushChange(extra);break;}
        case opcode.POP:{const rd=this.code[pc>>2];pc+=4;R[rd]=c.Intdata[sp>>2];sp+=4;extra=`${oname[mcode]} r${rd}=${R[rd]} sp->${sp}`;addReg(rd);flushChange(extra);break;}
        case opcode.JMP:{const ta=this.code[pc>>2];pc=ta;extra=`${oname[mcode]} ->${ta}`;flushChange(extra);break;}
        case opcode.JZ:{const rd=this.code[pc>>2];pc+=4;const ta=this.code[pc>>2];pc+=4;if(R[rd]===0){pc=ta;extra=`${oname[mcode]} r${rd}=0 ->${ta}`;}else{extra=`${oname[mcode]} r${rd}=${R[rd]} no jump`;}flushChange(extra);break;}
        case opcode.JNZ:{const rd=this.code[pc>>2];pc+=4;const ta=this.code[pc>>2];pc+=4;if(R[rd]!==0){pc=ta;extra=`${oname[mcode]} r${rd}!=0 ->${ta}`;}else{extra=`${oname[mcode]} r${rd}=${R[rd]} no jump`;}flushChange(extra);break;}
        case opcode.CMP:{const rs=this.code[pc>>2];pc+=4;const rt=this.code[pc>>2];pc+=4;const a=R[rs],b=R[rt];this._cmpEq=a===b;this._cmpLt=a<b;extra=`${oname[mcode]} r${rs}=${a} r${rt}=${b}`;flushChange(extra);break;}
        case opcode.CMPI:{const rs=this.code[pc>>2];pc+=4;const imm=this.code[pc>>2];pc+=4;const a=R[rs];this._cmpEq=a===imm;this._cmpLt=a<imm;extra=`${oname[mcode]} r${rs}=${a} #${imm}`;flushChange(extra);break;}
        case opcode.JEQ:{const ta=this.code[pc>>2];pc+=4;if(this._cmpEq){pc=ta;extra=`${oname[mcode]} ->${ta}`;}else{extra=`${oname[mcode]} no jump`;}flushChange(extra);break;}
        case opcode.JNE:{const ta=this.code[pc>>2];pc+=4;if(!this._cmpEq){pc=ta;extra=`${oname[mcode]} ->${ta}`;}else{extra=`${oname[mcode]} no jump`;}flushChange(extra);break;}
        case opcode.JLT:{const ta=this.code[pc>>2];pc+=4;if(this._cmpLt){pc=ta;extra=`${oname[mcode]} ->${ta}`;}else{extra=`${oname[mcode]} no jump`;}flushChange(extra);break;}
        case opcode.JGT:{const ta=this.code[pc>>2];pc+=4;if(!this._cmpEq&&!this._cmpLt){pc=ta;extra=`${oname[mcode]} ->${ta}`;}else{extra=`${oname[mcode]} no jump`;}flushChange(extra);break;}
        case opcode.JLE:{const ta=this.code[pc>>2];pc+=4;if(this._cmpEq||this._cmpLt){pc=ta;extra=`${oname[mcode]} ->${ta}`;}else{extra=`${oname[mcode]} no jump`;}flushChange(extra);break;}
        case opcode.JGE:{const ta=this.code[pc>>2];pc+=4;if(!this._cmpLt){pc=ta;extra=`${oname[mcode]} ->${ta}`;}else{extra=`${oname[mcode]} no jump`;}flushChange(extra);break;}
        case opcode.CALL:{const ta=this.code[pc>>2];pc+=4;sp-=4;c.Intdata[sp>>2]=pc;pc=ta;extra=`${oname[mcode]} ->${ta} sp=${sp}`;flushChange(extra);break;}
        case opcode.CALLR:{const rd=this.code[pc>>2];pc+=4;sp-=4;c.Intdata[sp>>2]=pc;pc=R[rd];extra=`${oname[mcode]} r${rd}=${R[rd]} sp=${sp}`;flushChange(extra);break;}
        case opcode.RET:{pc=c.Intdata[sp>>2];sp+=4;extra=`${oname[mcode]} ->${pc}`;flushChange(extra);break;}
        case opcode.ENTER:{const w=this.code[pc>>2];pc+=4;const sz=w&0xFF;const mask=(w>>8)&0xFF;sp-=4;c.Intdata[sp>>2]=bp;bp=sp;for(let rr=4;rr<=7;rr++){if(rr===5)continue;if(mask&(1<<rr)){sp-=4;c.Intdata[sp>>2]=R[rr];}}sp-=sz*4;if(this.opts.chkStack){(this._shk||(this._shk=[])).push({sp:sp,bp:bp});}extra=`${oname[mcode]} sz=${sz} mask=0x${mask.toString(16)} bp=${bp} sp=${sp}`;flushChange(extra);break;}
        case opcode.LEAVE:{if(this.opts.chkStack){const f=(this._shk||[]).pop();if(f&&(sp!==f.sp||bp!==f.bp)){const e=`[C4_CHKSTACK] LEAVE 栈不平衡: sp=0x${sp.toString(16)} (期望 0x${f.sp.toString(16)}) bp=0x${bp.toString(16)} (期望 0x${f.bp.toString(16)}) pc=0x${pc.toString(16)}`;(this._stackErrs||(this._stackErrs=[])).push(e);this._stackErr=e;}}const mask=this.code[pc>>2];sp=bp;let off=-4;for(let rr=4;rr<=7;rr++){if(rr===5)continue;if(mask&(1<<rr)){R[rr]=c.Intdata[(sp+off)>>2];off-=4;}}bp=c.Intdata[sp>>2];sp+=4;pc=c.Intdata[sp>>2];sp+=4;extra=`${oname[mcode]} mask=0x${(mask&0xFF).toString(16)} bp=${bp} pc=${pc}`;flushChange(extra);break;}
        case opcode.ADJ:{const sz=this.code[pc>>2];pc+=4;sp+=sz*4;extra=`${oname[mcode]} sz=${sz} sp->${sp}`;flushChange(extra);break;}
        case opcode.VM_EXIT:{const msg=`exit(${c.Intdata[sp>>2]}) cycle = ${cyc}\r\n`;c.output+=msg;if(!trace)console.log(msg);return;}
        case opcode.NOP:break;
        case opcode.SYS_CALL:{const idx=this.code[pc>>2];pc+=4;const ac=this.code[pc>>2];pc+=4;extra=`${oname[mcode]} idx=${idx} ac=${ac}`;R[0]=c.sysFuncs[idx](c,sp,ac);if(c._exitFlag){c._exitFlag=false;return;}break;}
        case 'MemberAccess': {
      // 计算基地址 (genExpr 后在 acc 中有值, tmp2 中有地址)
      this.genExpr(node.obj);
      // 成员偏移加在地址 (tmp2) 上, 而非值 (acc)
      if(node.memberOffset>0){
        this.emit(opcode.MOVI,this.tmp1,node.memberOffset);
        this.emit(opcode.ADD,this.tmp2,this.tmp2,this.tmp1);
      }
      this._storeTargetType=node.memberType;
      // struct 类型成员保留地址; 标量加载值
      if(node.memberType>=type.STRUCT&&node.memberType<type.PTR){
        this.emit(opcode.MOV,this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }else{
        this.emit(this.loadOp(node.memberType),this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }
      break;
    }
    default:{const msg=`unknown instruction = ${mcode}! cycle = ${cyc}\n`;c.output+=msg;console.log(msg);return;}
      }
    }
    const msg=`max cycles (${MAX_CYC}) reached at pc=${pc}\n`;c.output+=msg;console.log(msg);
  }
}

class kc_reg {
  constructor(size,backend){
    this.backend=backend||new RegBackend();
    this.output=''; this.intsizeof=4; this.shortertsizeof=2; this.charsizeof=1; this.prtsizeof=4;
    const p=new ArrayBuffer(POOL_BYTES);
    this.buffer=p; this.data=new Uint8Array(p); this.Intdata=new Int32Array(p);
    this.stack=this.Intdata; this.rwdata=this.data; this.src=this.data;
    this.pos=0; this.datapos=0;
    this.token=0; this.tokenvalue=0; this.tokentype=0; this.loc=0; this.line=0;
    this.sysboltable=[]; this.sysboltableIndex=0; this.FSpool=[];
    this.keyword="char else enum for if int return sizeof while short switch case default do goto continue break const unsigned volatile";
    this.loopStack=[]; this.switchStack=[];
    this.labels={}; this.gotoFixes={}; this.labelPatched=false;
    this.structDefs=[];
    this.initRecords=[]; // 全局初始化记录: {type, offset, data[], size}
    this.stmtLine=0; // 当前 C 语句的行号 (emit 时使用, 而非词法器位置)
    this.acc=0; // 表达式累加器寄存器
    this.tmp1=1;this.tmp2=2;this.tmp3=3; // 动态临时寄存器 (从 R0~R7 中排除 acc 后分配)
    this._calleeMask=0; // bitmap: bit6=R6, bit7=R7 被局部变量占用
    this._storeTargetType=type.INT; // 最近一次 genExpr 的目标存储类型
    this._isLeaf=false; // 当前函数是否为叶函数 (ReturnStmt 的 LEAVE 需要此信息)
    this._lastSlotOff=-1; // 最近一次 Identifier 的 slot 偏移 (复合赋值用 STORE_OFF)
    for(let i=0;i<1024;i++) this.sysboltable.push({Token:0,Hash:0,Name:0,Class:0,Type:0,Val:0,HClass:0,HType:0,HVal:0,Arr:0,Const:0,Weak:0,FuncId:-1,ArrSize:0,InReg:0});
  }

  // 根据 acc 分配临时寄存器 (从可用池中排除 acc 后取前3个)
  // 跳过 callee-saved 寄存器 (R4,R5,R6,R7) — 它们可能存有局部变量
  _setupRegs(accReg, reservedMask){
    this.acc=accReg;
    const r=[];
    for(let i=0;i<8;i++){
      if(i===accReg) continue;
      if(i===5) continue; // R5 = BP, 永不当临时寄存器
      if(this._calleeMask & (1<<i)) continue; // callee-saved 寄存器不可用作临时
      if(reservedMask && (reservedMask>>i)&1) continue; // 跳过已占用的参数寄存器
      r.push(i);
    }
    [this.tmp1,this.tmp2,this.tmp3]=r;
  }

  // 分配一个 callee-saved 寄存器给局部变量 (R4, R6, R7; R5=FP, 永不分配)
  allocCalleeReg(){
    for(let r=4;r<=7;r++){
      if(r===5) continue; // R5 is frame pointer, never allocate
      if(!(this._calleeMask&(1<<r))){this._calleeMask|=(1<<r);return r;}
    }
    return -1;
  }

  // 如果刚写了寄存器局部变量, 同步寄存器值
  _syncStore(){
    if(this._storeTargetReg>=0&&this._storeTargetReg!==this.acc){
      this.emit(opcode.MOV,this._storeTargetReg,this.acc);
    }
    this._storeTargetReg=-1;
  }

  // AST 子树是否含函数调用 (含 syscall): 用于实参跨调用暂存保护
  _exprHasCall(node){
    if(!node || typeof node !== 'object') return false;
    if(node.kind === 'FunctionCall') return true;
    for(const k in node){
      if(k==='kind'||k==='symIdx'||k==='opToken'||k==='compoundToken'||k==='val'||k==='addr'||k==='type'||k==='targetType') continue;
      const v = node[k];
      if(Array.isArray(v)){ for(const e of v){ if(this._exprHasCall(e)) return true; } }
      else if(v && typeof v === 'object' && v.kind){ if(this._exprHasCall(v)) return true; }
    }
    return false;
  }

  cmp(s,d,len){while(len--!==0)if(this.src[s]!==this.src[d])return false;return true;}

  // 委托到后端（适配分段模式）
  get op(){
    if(this.backend.inFunc)return this.backend.funcIp;
    return this.backend.ip;
  }
  set op(v){
    if(this.backend.inFunc){this.backend.funcIp=v;return;}
    this.backend.ip=v;
  }
  get lastOpcode(){return this.backend.lastOpcode;}
  set lastOpcode(v){this.backend.lastOpcode=v;}
  emit(...w){
    if(this.backend.srcLineMap!=null && this.stmtLine>0){
      const segId = this.backend.inFunc ? this.backend.funcSegments.length : -1;
      const tacAddr = this.here();
      const key = `${segId}_${tacAddr}`;
      if(!this.backend.srcLineMap[key]){
        this.backend.srcLineMap[key] = {line:this.stmtLine, tacAddr:tacAddr, asmLines:[], asmAddr:null};
      }
    }
    this.backend.emit(...w);
  }
  here(){return this.backend.here();}
  patch(p,v){this.backend.patch(p,v);}
  save(f){this.backend.save(f);}
  run(addr,argv,trace){this.backend.run(addr,argv,this,trace);}

  typeSize(t){
    if(t===type.CHAR)return this.charsizeof;
    if(t===type.SHORT)return this.shortertsizeof;
    if(t>=type.PTR)return this.prtsizeof;
    if(t>=type.STRUCT&&(t-type.STRUCT)<this.structDefs.length)return this.structDefs[t-type.STRUCT].size;
    return this.intsizeof;
  }

  getStructDefIndex(t){
    const bt=t>=type.PTR?t-type.PTR:t;
    if(bt>=type.STRUCT&&(bt-type.STRUCT)<this.structDefs.length)return bt-type.STRUCT;
    return -1;
  }

  isStructOrUnionType(t){return this.getStructDefIndex(t)>=0;}

  // "可直接用 LOAD_OFF/STORE_OFF 访问的标量槽类型": INT/CHAR/SHORT + 一切指针 (Type>=PTR).
  // struct/union (STRUCT..PTR-1) 需整体拷贝, 不在此列.
  // 注: 指针必须包含在内 —— 否则退化到 LEA+LOAD/STORE, 该 LEA 会使栈槽"地址逃逸",
  //     进而让 peepholeRegAlloc 的别名闸门放弃整个函数的寄存器提升.
  _isWordScalarType(t){return t===type.INT||t===type.CHAR||t===type.SHORT||t>=type.PTR;}
  loadOp(t){return t===type.CHAR?opcode.LOADB:t===type.SHORT?opcode.LOADH:opcode.LOAD;}
  loadOffOp(t){return t===type.CHAR?opcode.LOADB_OFF:t===type.SHORT?opcode.LOADH_OFF:opcode.LOAD_OFF;}
  storeOp(t){return t===type.CHAR?opcode.STOREB:t===type.SHORT?opcode.STOREH:opcode.STORE;}
  storeOffOp(t){return t===type.CHAR?opcode.STOREB_OFF:t===type.SHORT?opcode.STOREH_OFF:opcode.STORE_OFF;}
  // STORE 或 STORE_OFF (当 _lastSlotOff 可用时用后者, 省 LEA)
  _emitStore(addrReg, valReg){
    if(this._lastSlotOff >= 0){
      this.emit(this.storeOffOp(this._storeTargetType), this._lastSlotOff, valReg);
    } else {
      this.emit(this.storeOp(this._storeTargetType), addrReg, valReg);
    }
  }
  storePrimitiveType(t){return t===type.CHAR?type.CHAR:t===type.SHORT?type.SHORT:type.INT;}

  // 解析 struct/union 体 { member1; member2; ... }

  // 复合赋值 token 范围 (需映射到 Assign 同级的优先级)
  static isCompoundAssign(tok){ return tok>=174 && tok<=183; }
  static compPrec(tok){ return kc_reg.isCompoundAssign(tok) ? 143 : tok; }

  Comper(srcCode, size, sysFuncs) {
    const te = newte();
    let kwStr = this.keyword;
    for(const k of Object.keys(sysFuncs||{})) kwStr += ' ' + k;
    kwStr += ' struct union void main __weak';
    // 中断向量标记关键字: __interrupt_0 ~ __interrupt_MAX_IRQ
    // 名字虽有 41 个, 但全部映射到同一条 token (tokens.Interrupt), 序号存入符号表 Val 字段
    for (let i = 0; i <= MAX_IRQ; i++) kwStr += ' __interrupt_' + i;
    const kwBytes = te.encode(kwStr);
    // 中断处理函数完全由用户通过 __interrupt_N 关键字赋予, 不再预置任何 CRT 兜底桩.
    // 未定义的中断向量槽由 genROM 步骤 1 用 `B .` 无限循环兜底, 不会跑飞.
    // 预处理器 (M1): 独立 parse, 把 #define/#undef 拍平为纯 C 文本后再进编译器, 完全解耦.
    
    const srcCodeFlat = new Preprocessor().preprocessing(srcCode);
    const codeBytes = te.encode(srcCodeFlat);
    const srcLen = kwBytes.length + codeBytes.length + 1;
    const combined = new Uint8Array(srcLen + 1);
    combined.set(kwBytes, 0); combined[kwBytes.length] = 0;
    combined.set(codeBytes, kwBytes.length + 1); combined[srcLen] = 0;
    this.src = combined;
    this.pos = 0; this.line = 0; this.datapos = 0;
    this.backend.reset();
    this.backend._interruptSlots = {};  // 中断向量回填映射: index -> 函数名 (由 genFunc 填充)
    this.backend.sysboltable = this.sysboltable;   // 供 peephole 阶段内联/死调用消除反查被调函数
    this._calleeMask = 0; this.acc = 0; this.tmp1 = 1; this.tmp2 = 2; this.tmp3 = 3;
    for(let i=0;i<1024;i++) this.sysboltable[i]={Token:0,Hash:0,Name:0,Class:0,Type:0,Val:0,HClass:0,HType:0,HVal:0,Arr:0,Const:0,Weak:0,FuncId:-1,ArrSize:0,InReg:0,Interrupt:-1};

    // 初始化关键词
    let j = tokens.Char; while(j<=tokens.While){this.nexttokens();this.sysboltable[this.sysboltableIndex].Token=j++;}
    j = tokens.Short; while(j<=tokens.Break){this.nexttokens();this.sysboltable[this.sysboltableIndex].Token=j++;}
    this.nexttokens(); this.sysboltable[this.sysboltableIndex].Token = tokens.Const;
    this.nexttokens(); this.sysboltable[this.sysboltableIndex].Token = tokens.Unsigned;
    this.nexttokens(); this.sysboltable[this.sysboltableIndex].Token = tokens.Volatile;
    // sysfunc (必须在 struct/union/void/main 之前, 匹配 kwStr 顺序)
    const sysKeys = Object.keys(sysFuncs||{});
    this.sysFuncs = sysKeys.map(k => sysFuncs[k]); // 按索引存储回调
    for(let si=0;si<sysKeys.length;si++){
      this.nexttokens();
      this.sysboltable[this.sysboltableIndex].Class = tokens.Sys;
      this.sysboltable[this.sysboltableIndex].Type = type.INT;
      this.sysboltable[this.sysboltableIndex].Val = si;
    }
    j = tokens.Struct; while(j<=tokens.Union){this.nexttokens();this.sysboltable[this.sysboltableIndex].Token=j++;}
    this.nexttokens(); this.sysboltable[this.sysboltableIndex].Token = tokens.Char; // void
    this.nexttokens();
    const mainIndex = this.sysboltableIndex;
    // __weak 关键字 (用于弱符号函数定义, 可被用户同名函数顶替)
    this.nexttokens(); this.sysboltable[this.sysboltableIndex].Token = tokens.Weak;
    // __interrupt_0 ~ __interrupt_MAX_IRQ: 共用 tokens.Interrupt 一条 token, Val 记录向量序号
    for (let i = 0; i <= MAX_IRQ; i++) {
      this.nexttokens();
      this.sysboltable[this.sysboltableIndex].Token = tokens.Interrupt;
      this.sysboltable[this.sysboltableIndex].Val   = i;
    }

    // 跳到源码 (kwBytes 关键字前缀之后即为用户源码, 顺序解析)
    this.pos = kwBytes.length + 1;
    this.line = 1;
    this.nexttokens();

    // 解析顶层声明
    let skipNext = false;
    while(this.token !== 0){
      // const prefix
      let isConst = false;
      if(this.token===tokens.Const){ isConst=true; this.nexttokens(); }
      let isVolatile = false;
      if(this.token===tokens.Volatile){ isVolatile=true; this.nexttokens(); }
      // __weak / __interrupt_N 函数前缀: 标记后继续解析
      //   __weak        -> 弱符号, 可被用户同名函数顶替
      //   __interrupt_N -> 中断向量标记: 向量表第 N 项回填 BL 跳转到本函数
      //   二者可组合, 如: __interrupt_2 __weak void nmi_isr(void)
      //   (不新增 41 条关键字: __interrupt_N 作为一个整体被词法识别为 Id, 再用正则提取数字 N)
      let isWeak = false;
      let isInterrupt = -1;
      while (this.token === tokens.Weak || this.token === tokens.Interrupt) {
        if (this.token === tokens.Interrupt) isInterrupt = this.sysboltable[this.sysboltableIndex].Val;
        else isWeak = true;
        this.nexttokens();
      }

      // struct/union
      if(this.token===tokens.Struct||this.token===tokens.Union){
        const isU=this.token===tokens.Union;
        this.nexttokens();
        let structIdx=-1;
        let structName='';
        if(this.token===tokens.Id){
          structName=this._getSrcId(this.sysboltable[this.sysboltableIndex].Name);
          for(let si=0;si<this.structDefs.length;si++){
            if(this.structDefs[si].name===structName){structIdx=si;break;}
          }
          this.nexttokens();
        }
        if(this.token===123){
          const sd=this._parseStructBody(isU, structName);
          structIdx=this.structDefs.length;
          this.structDefs.push(sd);
        }
        // 处理 struct 变量声明: struct Name var; 或函数声明: struct Name func(...)
        if(structIdx>=0 && this.token===tokens.Id){
          // Peek: 检查 Id 后是否为 '(' → 函数声明
          const savedPos=this.pos,savedLine=this.line;
          const savedTokenVal=this.token,savedSymIdx=this.sysboltableIndex;
          this.nexttokens();
          const isFunc=this.token===40;
          this.pos=savedPos;this.line=savedLine;this.token=savedTokenVal;this.sysboltableIndex=savedSymIdx;
          if(isFunc){
            // 函数声明: 直接在这里解析, 不落下到类型声明循环
            const funcName=this._getSrcId(this.sysboltable[this.sysboltableIndex].Name);
            const funcNameIdx=this.sysboltableIndex;
            this.nexttokens();this.nexttokens(); // skip name + '('
            const params=[];
            while(this.token!==41){
              // 处理 (void) 形式的空参数列表: void 关键字被映射为 Char token,
              // 需特判 "void 后紧跟 ')'" 的情况, 视为无参数 (否则会被当成 char 形参而报错)
              if(this.token===tokens.Char){
                const _sp=this.pos,_sl=this.line,_st=this.token,_ss=this.sysboltableIndex;
                this.nexttokens();
                if(this.token===41){ this.pos=_sp;this.line=_sl;this.token=_st;this.sysboltableIndex=_ss; this.nexttokens(); continue; }
                this.pos=_sp;this.line=_sl;this.token=_st;this.sysboltableIndex=_ss;
              }
              this.tokentype=type.INT;
              while(this.token===tokens.Unsigned||this.token===tokens.Volatile)this.nexttokens();
              if(this.token===tokens.Int)this.nexttokens();
              else if(this.token===tokens.Char){this.nexttokens();this.tokentype=type.CHAR;}
              else if(this.token===tokens.Short){this.nexttokens();this.tokentype=type.SHORT;}
              else if(this.token===tokens.Struct||this.token===tokens.Union){
                this.nexttokens();
                if(this.token===tokens.Id){
                  let found=-1;
                  for(let si=0;si<this.structDefs.length;si++){
                    if(this.structDefs[si].name===this._getSrcId(this.sysboltable[this.sysboltableIndex].Name)){found=si;break;}
                  }
                  this.tokentype=found>=0?type.STRUCT+found:type.INT;
                  this.nexttokens();
                }
              }
              while(this.token===tokens.Mul){this.nexttokens();this.tokentype+=type.PTR;}
              if(this.token!==tokens.Id)throw new Error(`${this.line}: bad param`);
              const pName=this._getSrcId(this.sysboltable[this.sysboltableIndex].Name);
              params.push(AST.ParamDecl(pName,this.sysboltableIndex,this.tokentype));
              // 立即更新符号表 Type, 确保后续 body 解析中成员访问能正确查找到 struct 类型
              this.sysboltable[this.sysboltableIndex].Type=this.tokentype;
              this.nexttokens();if(this.token===44)this.nexttokens();
            }
            this.nexttokens(); // skip ')'
            if(this.token!==123)throw new Error(`${this.line}: '{' expected`);
            const body=this.parseStmt();
            this._inlineWrappers(body);
            const isEmpty=body.stmts&&body.stmts.length===0;
            if(!isEmpty){
              const fd=AST.FunctionDecl(funcName,funcNameIdx,params,body);
              this.genFunc(fd, isWeak, isInterrupt);
            }
            skipNext=true;
          }else{
            // 变量声明
            const gsym=this.sysboltable[this.sysboltableIndex];
            gsym.Class=tokens.Glo;
            gsym.Type=type.STRUCT+structIdx;
            gsym.Val=this.datapos;
            const sz=this.structDefs[structIdx].size;
            this.datapos+=Math.max(sz,4);
            this.datapos=(this.datapos+3)&(~3);
            this.nexttokens();
            if(this.token===59)this.nexttokens();
            skipNext=true;
          }
        }else if(structIdx>=0){
          skipNext=true;
        }
      }

      // enum
      else if(this.token===tokens.Enum){
        this.nexttokens(); if(this.token===123) this.nexttokens();
        let ev=0;
        while(this.token!==125){
          if(this.token===tokens.Id){ const si=this.sysboltableIndex; this.nexttokens();
            if(this.token===tokens.Assign){ this.nexttokens(); if(this.token===tokens.Num) ev=this.tokenvalue; this.nexttokens(); }
            this.sysboltable[si].Class=tokens.Num; this.sysboltable[si].Type=type.INT; this.sysboltable[si].Val=ev++;
            if(this.token===44) this.nexttokens();
          }else throw new Error(`${this.line}: bad enum`);
        }
        this.nexttokens(); skipNext=true;
      }

      // type declarations (var or function)
      else if(this.token===tokens.Int||this.token===tokens.Char||this.token===tokens.Short||
              this.token===tokens.Struct||this.token===tokens.Union||
              this.token===tokens.Unsigned||this.token===tokens.Volatile||(isConst&&this.token===tokens.Id)){
        // Check if this is a function: parse type, then name, then check for '('
        const savedPos = this.pos, savedLine = this.line, savedToken = this.token;
        while(this.token===tokens.Unsigned||this.token===tokens.Volatile) this.nexttokens();
        if(this.token===tokens.Int||this.token===tokens.Char||this.token===tokens.Short) this.nexttokens();
        else if(this.token===tokens.Struct||this.token===tokens.Union){
          this.nexttokens();
          if(this.token===tokens.Id) this.nexttokens(); // skip struct name
        }
        // Peek: skip pointer stars, then check for Id followed by '('
        while(this.token===tokens.Mul) this.nexttokens();
        if(this.token===tokens.Id){
          const peekIdx=this.sysboltableIndex; this.nexttokens();
          if(this.token===40){
            // FUNCTION declaration
            this.pos=savedPos;this.line=savedLine;this.token=savedToken;
            if(isConst) this.nexttokens();
            while(this.token===tokens.Unsigned||this.token===tokens.Volatile) this.nexttokens();
            if(this.token===tokens.Int||this.token===tokens.Char||this.token===tokens.Short) this.nexttokens();
            else if(this.token===tokens.Struct||this.token===tokens.Union){
              this.nexttokens();
              if(this.token===tokens.Id) this.nexttokens(); // skip struct name
            }
            while(this.token===tokens.Mul) this.nexttokens(); // skip pointer stars
            const funcNameIdx=this.sysboltableIndex;
            const funcName=this._getSrcId(this.sysboltable[funcNameIdx].Name);
            this.nexttokens();this.nexttokens(); // skip name + '('
            const params=[];
            while(this.token!==41){
              // 处理 (void) 形式的空参数列表: void 关键字被映射为 Char token,
              // 需特判 "void 后紧跟 ')'" 的情况, 视为无参数 (否则会被当成 char 形参而报错)
              if(this.token===tokens.Char){
                const _sp=this.pos,_sl=this.line,_st=this.token,_ss=this.sysboltableIndex;
                this.nexttokens();
                if(this.token===41){ this.pos=_sp;this.line=_sl;this.token=_st;this.sysboltableIndex=_ss; this.nexttokens(); continue; }
                this.pos=_sp;this.line=_sl;this.token=_st;this.sysboltableIndex=_ss;
              }
              this.tokentype=type.INT;
              while(this.token===tokens.Unsigned||this.token===tokens.Volatile)this.nexttokens();
              if(this.token===tokens.Int)this.nexttokens();
              else if(this.token===tokens.Char){this.nexttokens();this.tokentype=type.CHAR;}
              else if(this.token===tokens.Short){this.nexttokens();this.tokentype=type.SHORT;}
              else if(this.token===tokens.Struct||this.token===tokens.Union){
                this.nexttokens();
                if(this.token===tokens.Id){
                  // 查找 struct 定义获取类型索引
                  const sname=this._getSrcId(this.sysboltable[this.sysboltableIndex].Name);
                  let found=-1;
                  for(let si=0;si<this.structDefs.length;si++){
                    if(this.structDefs[si].name===sname){found=si;break;}
                  }
                  this.tokentype=found>=0?type.STRUCT+found:type.INT;
                  this.nexttokens();
                }
              }
              while(this.token===tokens.Mul){this.nexttokens();this.tokentype+=type.PTR;}
              if(this.token!==tokens.Id)throw new Error(`${this.line}: bad param`);
              const pName=this._getSrcId(this.sysboltable[this.sysboltableIndex].Name);
              params.push(AST.ParamDecl(pName,this.sysboltableIndex,this.tokentype));
              this.sysboltable[this.sysboltableIndex].Type=this.tokentype;
              this.nexttokens();if(this.token===44)this.nexttokens();
            }
            this.nexttokens(); // skip ')'
            if(this.token!==123)throw new Error(`${this.line}: '{' expected`);
            const body=this.parseStmt();
            this._inlineWrappers(body);
            // 死代码: 空函数体且从未被调用
            const isEmpty = body.stmts && body.stmts.length===0;
            if(!isEmpty) {
              const fd=AST.FunctionDecl(funcName,funcNameIdx,params,body);
              this.genFunc(fd, isWeak, isInterrupt);
            }
            skipNext=true;
            skipNext=true;
          } else {
            // GLOBAL VARIABLE declaration
            this.pos=savedPos;this.line=savedLine;this.token=savedToken;
            const result = this.parseDecl();
            // 修复: parseDecl 因 const 已在 1419 消费而看不到, 手动补 isConst
            if(isConst) for(const d of result.decls) d.isConst=true;
            // volatile 同理
            if(isVolatile) for(const d of result.decls) d.isVolatile=true;
            for(const d of result.decls){
              const gsym=this.sysboltable[d.symIdx];
              gsym.Class=tokens.Glo; gsym.Type=d.type;
              gsym.Const=d.isConst?1:0;
              gsym.Volatile=d.isVolatile?1:0;
              // 数组大小: 显式 arrSize > 初始值个数 > 0, 取最大者
              const elSize = d.isArray ? this.intsizeof : this.intsizeof;
              let arrSz=d.arrSize||0;
              if(d.init&&d.init.isArrayInit&&d.init.values.length>arrSz)
                arrSz=d.init.values.length;
              if(d.isArray){
                gsym.Type+=type.PTR; gsym.Arr=1; gsym.ArrSize=arrSz;
              }
              gsym.Val=this.datapos;
              const sz=d.isArray?elSize*arrSz:this.intsizeof;
              this.datapos+=Math.max(sz,this.intsizeof);
              this.datapos=(this.datapos+this.intsizeof-1)&(-this.intsizeof);
              // Write init data
              if(d.init){
                if(d.init.isArrayInit){
                  const baseType=d.type-type.PTR;
                  if(d.isArray&&baseType===type.CHAR){
                    // char 数组打包写入 data 字节数组
                    for(let k=0;k<d.init.values.length;k++)
                      this.data[gsym.Val+k]=d.init.values[k]&0xFF;
                  } else {
                    const baseAddr=gsym.Val>>2;
                    for(let k=0;k<d.init.values.length;k++)
                      this.Intdata[baseAddr+k]=d.init.values[k];
                  }
                }else{
                  // 展开 CastExpr → IntLiteral (如 int* p = (int*)0x50000014)
                  let initNode=d.init;
                  while(initNode.kind==='CastExpr'||initNode.kind==='Cast') initNode=initNode.expr;
                  if(initNode.kind==='IntLiteral'){
                    this.Intdata[gsym.Val>>2]=initNode.val;
                  }else if(initNode.kind==='AddressOf'&&initNode.expr&&initNode.expr.kind==='Identifier'){
                    // int*p=&x: 解析为 x 的地址
                    const tgt=this.sysboltable[initNode.expr.symIdx];
                    if(tgt&&tgt.Class===tokens.Glo) this.Intdata[gsym.Val>>2]=tgt.Val;
                  }
                }
              }
            }
            skipNext=true;
          }
        }
      }
      if(!skipNext) this.nexttokens();
      skipNext = false;
    }

    // 编译完成 — 优化流水线 (所有 pass 在 finalizeLayout 之前, 操作 funcSegments)
    // Peephole TAC 简化器: optLevel!==0 时启用, 对每个函数段做保语义窥孔优化。
    if(this.backend.optLevel !== 0 && typeof this.backend.peephole === 'function'){
      // 记下 main 入口的 FuncId, 供死函数消除 (F 层) 作为调用图根保留.
      this.backend._mainFuncId = (this.sysboltable[mainIndex] && this.sysboltable[mainIndex].FuncId>=0)
        ? this.sysboltable[mainIndex].FuncId : undefined;
      this.backend.peephole();
    }
    this.backend.resolveLabels();
    this.backend.finalizeLayout();
    // 解析跨函数 CALL 目标 (使用 FuncId → baseAddr 映射)
    this.backend.resolveCallFixups(this.sysboltable);

    // 重建 srcLineMap
    if(this.backend.srcLineMap){
      const flatMap={};
      for(let fi=0;fi<this.backend.funcSegments.length;fi++){
        const seg=this.backend.funcSegments[fi];
        const prefix=`${fi}_`;
        for(const [key,entry] of Object.entries(this.backend.srcLineMap)){
          if(key.startsWith(prefix)){
            const flatAddr=seg.baseAddr+entry.tacAddr;
            if(!flatMap[flatAddr]) flatMap[flatAddr]={...entry,tacAddr:flatAddr};
          }
        }
      }
      this.backend.srcLineMap=flatMap;
    }

    // 更新函数 Val
    for(let si=0;si<1024;si++){
      if(this.sysboltable[si].Class===tokens.Fun){
        const fid=this.sysboltable[si].FuncId;
        if(fid>=0&&fid<this.backend.funcSegments.length)
          this.sysboltable[si].Val=this.backend.funcSegments[fid].baseAddr;
      }
    }
    // 修正函数地址引用 (函数指针 MOVI) — 在 finalizeLayout 之后, seg 已有 baseAddr
    // 修正函数地址引用 (函数指针 MOVI) — 在 finalizeLayout 之后, seg 已有 baseAddr
    // 对于 ThumbBackend, 跳过此处理 (使用 ASM 标签)
    if (!this.backend._skipFuncAddrFixups) {
      for(const fx of this.backend.funcAddrFixups){
        const sym=this.sysboltable[fx.symIdx];
        if(sym&&sym.Class===tokens.Fun&&sym.FuncId>=0){
          const tgtSeg=this.backend.funcSegments[sym.FuncId];
          if(tgtSeg && fx.segIdx !== undefined){
            const srcSeg=this.backend.funcSegments[fx.segIdx];
            if(srcSeg){
              this.backend.code[(srcSeg.baseAddr>>2)+fx.wordPos]=tgtSeg.baseAddr;
            }
          }
        }
      }
    }
    return this.sysboltable[mainIndex].Val;
  }

  // printf
  printf(...args){
    const fmt=this.getstring(args[0]);let result='';let ai=1;
    for(let i=0;i<fmt.length;i++){
      if(fmt[i]==='%'){
        i++;let width=-1,precision=-1,dotSeen=false;
        if(i<fmt.length&&fmt[i]>='0'&&fmt[i]<='9'){width=0;while(i<fmt.length&&fmt[i]>='0'&&fmt[i]<='9'){width=width*10+(fmt.charCodeAt(i)-48);i++;}}
        if(i<fmt.length&&fmt[i]==='.'){i++;dotSeen=true;precision=0;while(i<fmt.length&&fmt[i]>='0'&&fmt[i]<='9'){precision=precision*10+(fmt.charCodeAt(i)-48);i++;}}
        if(i>=fmt.length)break;const spec=fmt[i];let val;
        switch(spec){
          case 'd':val=''+(args[ai]||0);ai++;break;
          case 'u':val=''+((args[ai]>>>0));ai++;break;
          case 'x':val=(args[ai]>>>0).toString(16);ai++;break;
          case 'c':val=String.fromCharCode(args[ai]||0);ai++;break;
          case 's':{const s=this.getstring(args[ai]||0);ai++;let sub=s;if(precision>=0&&precision<sub.length)sub=s.substring(0,precision);val=sub;break;}
          case '%':val='%';break;
          case 'MemberAccess': {
      // 计算基地址 (genExpr 后在 acc 中有值, tmp2 中有地址)
      this.genExpr(node.obj);
      // 成员偏移加在地址 (tmp2) 上, 而非值 (acc)
      if(node.memberOffset>0){
        this.emit(opcode.MOVI,this.tmp1,node.memberOffset);
        this.emit(opcode.ADD,this.tmp2,this.tmp2,this.tmp1);
      }
      this._storeTargetType=node.memberType;
      // struct 类型成员保留地址; 标量加载值
      if(node.memberType>=type.STRUCT&&node.memberType<type.PTR){
        this.emit(opcode.MOV,this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }else{
        this.emit(this.loadOp(node.memberType),this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }
      break;
    }
    default:val=fmt[i];break;
        }
        if(width>0&&val.length<width)val=' '.repeat(width-val.length)+val;
        result+=val;continue;
      }
      result+=fmt[i];
    }
    return result;
  }
  getstring(dpos){let s='';while(this.data[dpos]!==0)s+=String.fromCharCode(this.data[dpos++]);return s;}
  _getSrcId(off){let s='';while(this.src[off]&&((this.src[off]>=97&&this.src[off]<=122)||(this.src[off]>=65&&this.src[off]<=90)||(this.src[off]>=48&&this.src[off]<=57)||this.src[off]===95))s+=String.fromCharCode(this.src[off++]);return s;}

  // 从符号表构建初始化记录 (供 genROM 使用)
  buildInitRecords(){
    this.initRecords=[];
    const vars=[];
    for(let si=0;si<1024;si++){
      const sym=this.sysboltable[si];
      if(!sym||sym.Class!==131) continue; // tokens.Glo=131
      vars.push({sym,si});
    }
    // 按 Val 排序 (数据偏移)
    vars.sort((a,b)=>a.sym.Val-b.sym.Val);
    // 对每个变量, 检查 data 中对应位置是否有非零数据
    for(const {sym} of vars){
      const offset=sym.Val;
      const isArr=sym.Arr===1;
      const isConst=!!sym.Const;
      const arrSize=sym.ArrSize||0;
      const baseType=sym.Type&0xF; // CHAR=0, SHORT=1, INT=2
      let elSize;
      // 数据段所有数组元素均按 Intdata (4字节)存储, 不能用元素类型推导 elSize
      if(isArr) elSize=4;
      else if(baseType===type.CHAR) elSize=1;
      else if(baseType===type.SHORT) elSize=2;
      else elSize=4;
      let size;
      if(isArr&&arrSize>0) size=arrSize*elSize;
      else size=4;
      // 检查该区域是否有非零值
      let hasInit=false;
      if(baseType===type.CHAR && isArr){
        // char 数组: 从 data 字节区检查
        for(let bi=0;bi<size;bi++){
          if(this.data[offset+bi]!==0){hasInit=true;break;}
        }
      }else{
        for(let bi=0;bi<size;bi+=4){
          if(this.Intdata[(offset+bi)>>2]!==0){hasInit=true;break;}
        }
      }
      if(isConst){
        this.initRecords.push({type:'const',offset,size});
      }else if(hasInit){
        this.initRecords.push({type:'init',offset,size});
      }else{
        this.initRecords.push({type:'bss',offset,size});
      }
    }
    // 按 offset 排序
    this.initRecords.sort((a,b)=>a.offset-b.offset);
    // 合并相邻同类型记录
    const merged=[];
    for(const r of this.initRecords){
      const last=merged[merged.length-1];
      if(last&&last.type===r.type&&(last.offset+last.size)===r.offset){
        last.size+=r.size;
      }else{
        merged.push({...r});
      }
    }
    this.initRecords=merged;
  }
//file lexer.js
  nexttokens() {
    let offset;
    while((this.token=this.src[this.pos])!==0){
      this.pos++;
      if(this.token===10){this.line++;}
      else if(this.token===35){while(this.src[this.pos]!==0&&this.src[this.pos]!==10)this.pos++;}
      else if((this.token>=97&&this.token<=122)||(this.token>=65&&this.token<=90)||this.token===95){
        offset=this.pos-1;
        while((this.src[this.pos]>=97&&this.src[this.pos]<=122)||(this.src[this.pos]>=65&&this.src[this.pos]<=90)||(this.src[this.pos]>=48&&this.src[this.pos]<=57)||this.src[this.pos]===95)
          this.token=(this.token*147+this.src[this.pos++])>>>0;
        this.token=(this.token<<6)+(this.pos-offset)>>>0;
        this.sysboltableIndex=0;
        while(this.sysboltable[this.sysboltableIndex].Token!==0){
          if(this.token===this.sysboltable[this.sysboltableIndex].Hash&&this.cmp(this.sysboltable[this.sysboltableIndex].Name,offset,this.pos-offset)){
            this.token=this.sysboltable[this.sysboltableIndex].Token;return;
          }
          this.sysboltableIndex++;
        }
        this.sysboltable[this.sysboltableIndex].Name=offset;
        this.sysboltable[this.sysboltableIndex].Hash=this.token;
        this.token=this.sysboltable[this.sysboltableIndex].Token=tokens.Id;return;
      }
      else if(this.token>=48&&this.token<=57){
        if((this.tokenvalue=this.token-48)!==0){
          while(this.src[this.pos]>=48&&this.src[this.pos]<=57)
            this.tokenvalue=this.tokenvalue*10+this.src[this.pos++]-48;
        }else if(this.src[this.pos]===120||this.src[this.pos]===88){
          this.pos++;
          while((this.token=this.src[this.pos])!==0&&((this.token>=48&&this.token<=57)||(this.token>=97&&this.token<=102)||(this.token>=65&&this.token<=70))){
            this.tokenvalue=this.tokenvalue*16+(this.token&0xf)+(this.token>=65?9:0);
            this.pos++;
          }
        }else{while(this.src[this.pos]>=48&&this.src[this.pos]<=55)this.tokenvalue=this.tokenvalue*8+this.src[this.pos++]-48;}
        this.token=tokens.Num;return;
      }
      else if(this.token===39||this.token===34){
        offset=this.datapos;
        while(this.src[this.pos]!==0&&this.src[this.pos]!==this.token){
          if((this.tokenvalue=this.src[this.pos++])===92){
            switch(this.tokenvalue=this.src[this.pos++]){
              case 110:this.tokenvalue=10;break;case 114:this.tokenvalue=13;break;case 116:this.tokenvalue=9;break;
              case 'MemberAccess': {
      // 计算基地址 (genExpr 后在 acc 中有值, tmp2 中有地址)
      this.genExpr(node.obj);
      // 成员偏移加在地址 (tmp2) 上, 而非值 (acc)
      if(node.memberOffset>0){
        this.emit(opcode.MOVI,this.tmp1,node.memberOffset);
        this.emit(opcode.ADD,this.tmp2,this.tmp2,this.tmp1);
      }
      this._storeTargetType=node.memberType;
      // struct 类型成员保留地址; 标量加载值
      if(node.memberType>=type.STRUCT&&node.memberType<type.PTR){
        this.emit(opcode.MOV,this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }else{
        this.emit(this.loadOp(node.memberType),this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }
      break;
    }
    default:if(this.tokenvalue>=48&&this.tokenvalue<=57){this.tokenvalue-=48;while(this.src[this.pos]>=48&&this.src[this.pos]<=57)this.tokenvalue=this.tokenvalue*10+this.src[this.pos++]-48;this.token=this.src[this.pos];}break;
            }
          }
          if(this.token===34)this.data[this.datapos++]=this.tokenvalue>>>0;
        }
        this.pos++;
        if(this.token===34){this.tokenvalue=offset;}else{this.token=tokens.Num;}
        return;
      }
      else{
        switch(this.token){
          case 61:if(this.src[this.pos]===61){this.pos++;this.token=tokens.Eq;}else this.token=tokens.Assign;return;
          case 43:
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.AddAssign;}
            else if(this.src[this.pos]===43){this.pos++;this.token=tokens.Inc;}
            else this.token=tokens.Add;
            return;
          case 45:
            if(this.src[this.pos]===62){this.pos++;this.token=tokens.Arrow;return;}
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.SubAssign;}
            else if(this.src[this.pos]===45){this.pos++;this.token=tokens.Dec;}
            else this.token=tokens.Sub;
            return;
          case 42:
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.MulAssign;}
            else this.token=tokens.Mul;
            return;
          case 47:
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.DivAssign;return;}
            if(this.src[this.pos]===47){this.pos++;while(this.src[this.pos]!==0&&this.src[this.pos]!==10)this.pos++;break;}
            this.token=tokens.Div;return;
          case 37:
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.ModAssign;}
            else this.token=tokens.Mod;
            return;
          case 33:if(this.src[this.pos]===61){this.pos++;this.token=tokens.Ne;}return;
          case 60:
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.Le;}
            else if(this.src[this.pos]===60){this.pos++;if(this.src[this.pos]===61){this.pos++;this.token=tokens.ShlAssign;}else this.token=tokens.Shl;}
            else this.token=tokens.Lt;
            return;
          case 62:
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.Ge;}
            else if(this.src[this.pos]===62){this.pos++;if(this.src[this.pos]===61){this.pos++;this.token=tokens.ShrAssign;}else this.token=tokens.Shr;}
            else this.token=tokens.Gt;
            return;
          case 38:
            if(this.src[this.pos]===38){this.pos++;this.token=tokens.Lan;}
            else if(this.src[this.pos]===61){this.pos++;this.token=tokens.AndAssign;}
            else this.token=tokens.And;
            return;
          case 124:
            if(this.src[this.pos]===124){this.pos++;this.token=tokens.Lor;}
            else if(this.src[this.pos]===61){this.pos++;this.token=tokens.OrAssign;}
            else this.token=tokens.Or;
            return;
          case 94:
            if(this.src[this.pos]===61){this.pos++;this.token=tokens.XorAssign;}
            else this.token=tokens.Xor;
            return;
          case 46:this.token=tokens.Dot;return;
          case 91:this.token=tokens.Brak;return;case 63:this.token=tokens.Cond;return;
          case 126:case 59:case 123:case 125:case 40:case 41:case 93:case 44:case 58:return;
        }
      }
    }
  }

  fillrwdata_str(s) {const e=new TextEncoder(),b=e.encode(s),dp=this.datapos;for(let i=0;i<b.length;i++)this.data[i+this.datapos]=b[i];this.datapos+=b.length;this.datapos=(this.datapos+this.intsizeof-1)&(-this.intsizeof);return dp;};

  fillrwdata_int(d) {const dp=this.datapos;this.Intdata[this.datapos>>2]=d;this.datapos=(this.datapos+this.intsizeof-1)&(-this.intsizeof);return dp;};
//file parser.js
  _parseStructBody(isUnion, structName) {
      this.nexttokens(); // skip '{'
      const members=[];
      let offset=0;
      while(this.token!==125&&this.token!==0){
        let mt=type.INT;
        while(this.token===tokens.Unsigned||this.token===tokens.Volatile)this.nexttokens();
        if(this.token===tokens.Int)this.nexttokens();
        else if(this.token===tokens.Char){this.nexttokens();mt=type.CHAR;}
        else if(this.token===tokens.Short){this.nexttokens();mt=type.SHORT;}
        else if(this.token===tokens.Struct||this.token===tokens.Union){
          const subIsU=this.token===tokens.Union;
          this.nexttokens();
          let _refStructName='';
          if(this.token===tokens.Id){_refStructName=this._getSrcId(this.sysboltable[this.sysboltableIndex].Name);this.nexttokens();}
          if(this.token===123){
            const sd=this._parseStructBody(subIsU);
            sd.name=sd.name||('_anon'+this.structDefs.length);
            const sidx=this.structDefs.length;
            this.structDefs.push(sd);
            mt=type.STRUCT+sidx;
          } else {
            // 查找已定义的命名 struct, 获取正确的类型索引
            let _foundIdx=-1;
            if(_refStructName){
              for(let _si=0;_si<this.structDefs.length;_si++){
                if(this.structDefs[_si].name===_refStructName){_foundIdx=_si;break;}
              }
            }
            mt=_foundIdx>=0?type.STRUCT+_foundIdx:type.STRUCT;
          }
        }
        while(this.token===tokens.Mul){this.nexttokens();mt+=type.PTR;}
        if(this.token!==tokens.Id)throw new Error(`${this.line}: member name expected`);
        const mnameIdx=this.sysboltableIndex;
        const mname=this._getSrcId(this.sysboltable[mnameIdx].Name);
        this.nexttokens();
        // array member
        let arrCount=0;
        if(this.token===tokens.Brak){
          this.nexttokens();
          if(this.token===tokens.Num){arrCount=this.tokenvalue;this.nexttokens();}
          if(this.token===93)this.nexttokens();else throw new Error(`${this.line}: ']' expected`);
        }
        const elSize=this.typeSize(mt>=type.PTR?type.INT:mt);
        const msize=arrCount>0?elSize*arrCount:elSize;
        if(isUnion){
          members.push({name:mname,symIdx:mnameIdx,type:mt,offset:0,size:msize,count:arrCount});
          offset=Math.max(offset,msize);
        }else{
          // align to member alignment
          const align=elSize;
          offset=(offset+align-1)&(~(align-1));
          members.push({name:mname,symIdx:mnameIdx,type:mt,offset,size:msize,count:arrCount});
          offset+=msize;
        }
        if(this.token===59)this.nexttokens();else if(this.token!==125)throw new Error(`${this.line}: ';' expected`);
      }
      if(this.token===125)this.nexttokens(); // skip '}'
      if(this.token===59)this.nexttokens(); // skip ';'
      // align struct overall size to 4
      const totalSize=(offset+3)&(~3);
      return {name:structName||'',isUnion,size:totalSize,members};
    }
  ;
  
    parseExpr(lev) {
      let node=null, t, lastsymbol;
  
      if(this.token===0)throw new Error(`${this.line}: unexpected eof in expression`);
  
      // 数值常量
      if(this.token===tokens.Num){const v=this.tokenvalue;this.nexttokens();this.tokentype=type.INT;node=AST.IntLiteral(v);}
      // 字符串常量
      else if(this.token===34){
        const addr=this.tokenvalue;this.nexttokens();while(this.token===34)this.nexttokens();
        this.datapos=(this.datapos+this.intsizeof-1)&(-this.intsizeof);this.tokentype=type.PTR;
        node=AST.StringLiteral(addr);
      }
      // sizeof
      else if(this.token===tokens.Sizeof){
        this.nexttokens();if(this.token===40)this.nexttokens();else throw new Error(`${this.line}: '(' expected`);
        let szt=type.INT;let handled=false;
        while(this.token===tokens.Unsigned||this.token===tokens.Volatile)this.nexttokens();
        if(this.token===tokens.Int)this.nexttokens();
        else if(this.token===tokens.Short){this.nexttokens();szt=type.SHORT;}
        else if(this.token===tokens.Char){this.nexttokens();szt=type.CHAR;}
        else if(this.token===tokens.Struct||this.token===tokens.Union){
          this.nexttokens();if(this.token!==tokens.Id)throw new Error(`${this.line}: struct name expected`);
          szt=this.sysboltable[this.sysboltableIndex].Type;this.nexttokens();
        }else if(this.token===tokens.Id){
          const sym=this.sysboltable[this.sysboltableIndex];this.nexttokens();
          while(this.token===tokens.Mul){szt+=type.PTR;this.nexttokens();}
          if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
          this.tokentype=type.INT;handled=true;
          node=sym.Arr?AST.SizeOfExpr(AST.IntLiteral(this.typeSize(sym.Type-type.PTR)*sym.ArrSize)):AST.SizeOfType(szt);
        }
        if(!handled){
          while(this.token===tokens.Mul){szt+=type.PTR;this.nexttokens();}
          if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
          this.tokentype=type.INT;node=AST.SizeOfType(szt);
        }
      }
      // 标识符
      else if(this.token===tokens.Id){
        lastsymbol=this.sysboltableIndex;this.nexttokens();
        if(this.token===40){
          this.nexttokens();const args=[];
          while(this.token!==41){args.push(this.parseExpr(tokens.Assign));if(this.token===44)this.nexttokens();}
          this.nexttokens();
          const fnSym=this.sysboltable[lastsymbol];
          this.tokentype=fnSym.Type;
          // 函数指针: 保存 callee 表达式
          if(fnSym.Class===tokens.Loc||fnSym.Class===tokens.Glo){
            node=AST.FunctionCall(this.getstring(fnSym.Name),lastsymbol,args,node);
          }else{
            node=AST.FunctionCall(this.getstring(fnSym.Name),lastsymbol,args);
          }
        }else if(this.sysboltable[lastsymbol].Class===tokens.Num){
          this.tokentype=type.INT;node=AST.IntLiteral(this.sysboltable[lastsymbol].Val);
        }else{
          this.tokentype=this.sysboltable[lastsymbol].Type;
          node=AST.Identifier(this.getstring(this.sysboltable[lastsymbol].Name),lastsymbol);
        }
      }
      // 括号/转换
      else if(this.token===40){
        this.nexttokens();
        if(this.token===tokens.Int||this.token===tokens.Char||this.token===tokens.Short||this.token===tokens.Struct||this.token===tokens.Union||this.token===tokens.Unsigned||this.token===tokens.Volatile){
          while(this.token===tokens.Unsigned||this.token===tokens.Volatile)this.nexttokens();
          t=type.INT;if(this.token===tokens.Char){t=type.CHAR;this.nexttokens();}else if(this.token===tokens.Short){t=type.SHORT;this.nexttokens();}else if(this.token===tokens.Struct||this.token===tokens.Union){this.nexttokens();if(this.token!==tokens.Id)throw new Error(`${this.line}: struct expected`);t=this.sysboltable[this.sysboltableIndex].Type;this.nexttokens();}else this.nexttokens();
          while(this.token===tokens.Mul){t+=type.PTR;this.nexttokens();}
          if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: bad cast`);
          node=AST.CastExpr(t,this.parseExpr(tokens.Inc));this.tokentype=t;
        }else{node=this.parseExpr(tokens.Assign);if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);}
      }
      // 解引用 *
      else if(this.token===tokens.Mul){
        this.nexttokens();node=this.parseExpr(tokens.Inc);
        if(this.tokentype>=type.PTR)this.tokentype-=type.PTR;else throw new Error(`${this.line}: bad dereference`);
        node=AST.Dereference(node);lastsymbol=undefined;
      }
      // 取地址 &
      else if(this.token===tokens.And){this.nexttokens();node=this.parseExpr(tokens.Inc);this.tokentype+=type.PTR;node=AST.AddressOf(node);}
      // !
      else if(this.token===33){this.nexttokens();node=AST.UnaryOp('!',this.parseExpr(tokens.Inc));}
      // ~
      else if(this.token===126){this.nexttokens();node=AST.UnaryOp('~',this.parseExpr(tokens.Inc));}
      // + 一元
      else if(this.token===tokens.Add){this.nexttokens();node=this.parseExpr(tokens.Inc);}
      // - 一元
      else if(this.token===tokens.Sub){this.nexttokens();if(this.token===tokens.Num){node=AST.IntLiteral(-this.tokenvalue);this.nexttokens();}else node=AST.UnaryOp('-',this.parseExpr(tokens.Inc));}
      // ++/--expr
      else if(this.token===tokens.Inc||this.token===tokens.Dec){
        t=this.token;this.nexttokens();node=this.parseExpr(tokens.Inc);
        node=AST.PrefixOp(node,t===tokens.Inc?'++':'--');
      }
      else throw new Error(`${this.line}: bad expression`);
  
      // 二元运算符 + 后缀
      while(node && kc_reg.compPrec(this.token)>=lev){
        t=this.tokentype;
        const opTok=this.token;
  
        // = 赋值 + 复合赋值
        if(opTok===tokens.Assign||(opTok>=tokens.AddAssign&&opTok<=tokens.XorAssign)){
          this.nexttokens();
          const rhs=this.parseExpr(tokens.Assign);
          node=AST.Assign(node,rhs,opTok!==tokens.Assign,opTok);
          this.tokentype=t;
        }
        // ?:
        else if(opTok===tokens.Cond){
          this.nexttokens();const then=this.parseExpr(tokens.Assign);
          if(this.token===58)this.nexttokens();else throw new Error(`${this.line}: ':' expected`);
          node=AST.Conditional(node,then,this.parseExpr(tokens.Cond));
        }
        // ||
        else if(opTok===tokens.Lor){this.nexttokens();node=AST.LogicalOr(node,this.parseExpr(tokens.Lan));this.tokentype=type.INT;}
        // &&
        else if(opTok===tokens.Lan){this.nexttokens();node=AST.LogicalAnd(node,this.parseExpr(tokens.Or));this.tokentype=type.INT;}
        // 二元运算
        else if(opTok>=tokens.Or&&opTok<=tokens.Mod){
          let nextLev;if(opTok===tokens.Or)nextLev=tokens.Xor;else if(opTok===tokens.Xor)nextLev=tokens.And;
          else if(opTok===tokens.And)nextLev=tokens.Eq;else if(opTok===tokens.Eq||opTok===tokens.Ne)nextLev=tokens.Lt;
          else if(opTok>=tokens.Lt&&opTok<=tokens.Ge)nextLev=tokens.Shl;else if(opTok===tokens.Shl||opTok===tokens.Shr)nextLev=tokens.Add;
          else if(opTok===tokens.Add||opTok===tokens.Sub)nextLev=tokens.Mul;else nextLev=tokens.Inc;
          this.nexttokens();
          const rhsNode=this.parseExpr(nextLev);
          node=AST.BinaryOp(node,opTok,rhsNode);
          // 指针算术: p+n, n+p, p-n 结果保持指针类型
          if((opTok===tokens.Add||opTok===tokens.Sub) && (t>=type.PTR||this.tokentype>=type.PTR)){
            this.tokentype = t>=type.PTR ? t : this.tokentype; // 恢复指针类型
          } else {
            this.tokentype=type.INT;
          }
        }
        // 后缀 ++/--
        else if(opTok===tokens.Inc||opTok===tokens.Dec){
          this.nexttokens();node=AST.PostfixOp(node,opTok===tokens.Inc?'++':'--');
        }
        // 下标 [...]
        else if(opTok===tokens.Brak){
          this.nexttokens();const idx=this.parseExpr(tokens.Assign);
          if(this.token===93)this.nexttokens();else throw new Error(`${this.line}: ']' expected`);
          node=AST.Subscript(node,idx);this.tokentype=t-type.PTR;
        }
        // . 成员
        else if(opTok===tokens.Dot){
          this.nexttokens();if(this.token!==tokens.Id)throw new Error(`${this.line}: member expected`);
          const midx=this.sysboltableIndex;
          const mname=this._getSrcId(this.sysboltable[midx].Name);
          this.nexttokens();
          node=AST.MemberAccess(node,mname,midx);
          // 查找成员偏移和类型
          const structIdx=this.getStructDefIndex(t);
          if(structIdx>=0&&structIdx<this.structDefs.length){
            const sd=this.structDefs[structIdx];
            const m=sd.members.find(x=>x.name===mname);
            if(m){node.memberOffset=m.offset;node.memberType=m.type;node.memberSize=m.size;this.tokentype=m.type;}
          }
        }
        // -> 成员
        else if(opTok===tokens.Arrow){
          this.nexttokens();if(this.token!==tokens.Id)throw new Error(`${this.line}: member expected`);
          const midx=this.sysboltableIndex;
          const mname=this._getSrcId(this.sysboltable[midx].Name);
          this.nexttokens();
          node=AST.PtrMemberAccess(node,mname,midx);
          // 查找成员偏移和类型 (基类型去掉 PTR)
          const structIdx=this.getStructDefIndex(t>=type.PTR?t-type.PTR:t);
          if(structIdx>=0&&structIdx<this.structDefs.length){
            const sd=this.structDefs[structIdx];
            const m=sd.members.find(x=>x.name===mname);
            if(m){node.memberOffset=m.offset;node.memberType=m.type;node.memberSize=m.size;this.tokentype=m.type;}
          }
        }
        else break;
      }
      // 函数指针调用: (expr)(args) — 不受优先级限制
      while(this.token===40){
        this.nexttokens();const fargs=[];
        while(this.token!==41){fargs.push(this.parseExpr(tokens.Assign));if(this.token===44)this.nexttokens();}
        if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
        node=AST.FunctionCall('',-1,fargs,node);
      }
      return node;
    }
  
    // AST 语句解析 — 返回 AST.Stmt (带 _stmtLine);
  
    parseStmt() {
      const _L=this.line>0?this.line:0; let n;
      // 局部变量声明
      if(this.token===tokens.Int||this.token===tokens.Char||this.token===tokens.Short||
         this.token===tokens.Const||this.token===tokens.Unsigned||this.token===tokens.Volatile||
         this.token===tokens.Struct||this.token===tokens.Union){
        n=AST.ExprStmt({kind:'DeclStmt', decls:this.parseDecl()});
      }
      else if(this.token===tokens.If){
        this.nexttokens();if(this.token===40)this.nexttokens();else throw new Error(`${this.line}: '(' expected`);
        const cond=this.parseExpr(tokens.Assign);
        if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
        const thenStmt=this.parseStmt();
        if(this.token===tokens.Else){this.nexttokens();n=AST.IfStmt(cond,thenStmt,this.parseStmt());}
        else n=AST.IfStmt(cond,thenStmt);
      }
      else if(this.token===tokens.For){
        this.nexttokens();if(this.token===40)this.nexttokens();else throw new Error(`${this.line}: '(' expected`);
        const init=this.parseExpr(tokens.Assign);
        if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);
        const cond=this.parseExpr(tokens.Assign);
        if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);
        const incr=this.parseExpr(tokens.Assign);
        if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
        n=AST.ForStmt(init,cond,incr,this.parseStmt());
      }
      else if(this.token===tokens.While){
        this.nexttokens();if(this.token===40)this.nexttokens();else throw new Error(`${this.line}: '(' expected`);
        const cond=this.parseExpr(tokens.Assign);
        if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
        n=AST.WhileStmt(cond,this.parseStmt());
      }
      else if(this.token===tokens.Do){
        this.nexttokens();const body=this.parseStmt();
        if(this.token!==tokens.While)throw new Error(`${this.line}: 'while' expected in do-while`);
        this.nexttokens();if(this.token===40)this.nexttokens();else throw new Error(`${this.line}: '(' expected`);
        const cond=this.parseExpr(tokens.Assign);
        if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
        if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);
        n=AST.DoWhileStmt(body,cond);
      }
      else if(this.token===tokens.Switch){
        this.nexttokens();if(this.token===40)this.nexttokens();else throw new Error(`${this.line}: '(' expected`);
        const expr=this.parseExpr(tokens.Assign);
        if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
        if(this.token!==123)throw new Error(`${this.line}: '{' expected`);
        this.nexttokens();
        const cases=[];
        while(this.token!==125){
          if(this.token===tokens.Case){
            this.nexttokens();if(this.token!==tokens.Num)throw new Error(`${this.line}: case value must be num`);
            const cv=this.tokenvalue;this.nexttokens();
            if(this.token===58)this.nexttokens();else throw new Error(`${this.line}: ':' expected`);
            const body=[];
            while(this.token!==125&&this.token!==tokens.Case&&this.token!==tokens.Default)
              body.push(this.parseStmt());
            cases.push(AST.CaseStmt(cv,body));
          }else if(this.token===tokens.Default){
            this.nexttokens();if(this.token===58)this.nexttokens();else throw new Error(`${this.line}: ':' expected`);
            const body=[];
            while(this.token!==125&&this.token!==tokens.Case&&this.token!==tokens.Default)
              body.push(this.parseStmt());
            cases.push(AST.DefaultStmt(body));
          }else throw new Error(`${this.line}: expected case or default`);
        }
        this.nexttokens();
        n=AST.SwitchStmt(expr,cases);
      }
      else if(this.token===tokens.Goto){
        this.nexttokens();if(this.token!==tokens.Id)throw new Error(`${this.line}: label expected`);
        const label=this.getstring(this.sysboltable[this.sysboltableIndex].Name);
        this.nexttokens();
        if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);
        n=AST.GotoStmt(label);
      }
      else if(this.token===tokens.Break){this.nexttokens();if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);n=AST.BreakStmt();}
      else if(this.token===tokens.Continue){this.nexttokens();if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);n=AST.ContinueStmt();}
      else if(this.token===tokens.Return){
        this.nexttokens();
        const e=(this.token!==59)?this.parseExpr(tokens.Assign):null;
        if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);
        n=AST.ReturnStmt(e);
      }
      else if(this.token===123){this.nexttokens();const stmts=[];while(this.token!==125)stmts.push(this.parseStmt());this.nexttokens();n=AST.Block(stmts);}
      else if(this.token===59){this.nexttokens();n=AST.Block([]);}
      else {
        const expr=this.parseExpr(tokens.Assign);
        if(this.token===59)this.nexttokens();else throw new Error(`${this.line}: ';' expected`);
        n=AST.ExprStmt(expr);
      }
      n._stmtLine=_L; return n;
    }
  
    // 解析声明: type name [=init] [, name2=init2] ...
    // 返回 {decls: [VarDecl], type: baseType, isConst, isVolatile};
  
    parseDecl() {
      let isConst = false, isVolatile = false, baseType = type.INT;
      if(this.token===tokens.Const){ isConst=true; this.nexttokens(); }
      if(this.token===tokens.Volatile){ isVolatile=true; this.nexttokens(); }
      while(this.token===tokens.Unsigned) this.nexttokens();
      if(this.token===tokens.Int) this.nexttokens();
      else if(this.token===tokens.Short){ this.nexttokens(); baseType=type.SHORT; }
      else if(this.token===tokens.Char){ this.nexttokens(); baseType=type.CHAR; }
      else if(this.token===tokens.Struct||this.token===tokens.Union){
        const isUnion = this.token===tokens.Union;
        this.nexttokens();
        let structIdx = -1;
        let structName = '';
        if(this.token===tokens.Id){
          structName = this._getSrcId(this.sysboltable[this.sysboltableIndex].Name);
          for(let si=0;si<this.structDefs.length;si++){
            if(this.structDefs[si].name===structName){structIdx=si;break;}
          }
          this.nexttokens();
        }
        if(this.token===123){
          const sd = this._parseStructBody(isUnion, structName);
          structIdx = this.structDefs.length;
          this.structDefs.push(sd);
        }
        if(structIdx>=0){baseType=type.STRUCT+structIdx;}else{baseType=type.INT;}
        // 继续解析变量名 (可能无变量), 允许 * (指针) 和 Id (变量名)
        const isVarToken=this.token===tokens.Id||this.token===tokens.Mul;
        if(!isVarToken&&this.token!==59&&this.token!==44)return {decls:[],type:baseType,isConst,isStruct:true};
        if(this.token===59){this.nexttokens();return {decls:[],type:baseType,isConst,isStruct:true};}
      }
  
      const decls = [];
      do {
        let declType = baseType;
        // 函数指针: int (*name)(params)
        let isFuncPtr=false, funcPtrParams=[];
        if(this.token===40){
          const savedPos=this.pos,savedLine=this.line;
          this.nexttokens();
          if(this.token===tokens.Mul){
            isFuncPtr=true;
            this.nexttokens(); declType+=type.PTR; // * 
            while(this.token===tokens.Mul){this.nexttokens();declType+=type.PTR;}
          }
        }
        if(isFuncPtr){
          if(this.token!==tokens.Id)throw new Error(`${this.line}: expected identifier`);
          const fpNameIdx=this.sysboltableIndex;
          this.sysboltable[fpNameIdx].Type=declType;
          this.nexttokens();
          if(this.token===41)this.nexttokens();else throw new Error(`${this.line}: ')' expected`);
          // 跳过参数列表 (params)
          if(this.token===40){let d=1;this.nexttokens();while(d>0&&this.token!==0){if(this.token===40)d++;if(this.token===41)d--;if(d>0)this.nexttokens();}if(this.token===41)this.nexttokens();}
          // 声明即初始化: int (*f)(int,int) = add;
          // (曾丢失: init 硬编码 null, "= add" 残余被外层当独立表达式语句丢弃 → f 未初始化)
          let fpInit=null;
          if(this.token===tokens.Assign){ this.nexttokens(); fpInit=this.parseExpr(tokens.Assign); }
          // 创建函数指针变量声明, 不吞 ';' (外层 do-while 处理)
          decls.push(AST.VarDecl('',fpNameIdx,declType,fpInit,false,false,0));
          if(this.token===44){this.nexttokens();continue;}
          break;
        }else{
          while(this.token===tokens.Mul){ this.nexttokens(); declType+=type.PTR; }
          if(this.token!==tokens.Id) throw new Error(`${this.line}: expected identifier`);
        }
        const nameIdx = this.sysboltableIndex;
        const name = this.getstring(this.sysboltable[nameIdx].Name);
        this.sysboltable[nameIdx].Type = declType; // 立即设置类型, 供后续表达式使用
        this.nexttokens();
  
        let isArray=false, arrSize=0;
        if(this.token===tokens.Brak){
          isArray=true; this.nexttokens();
          if(this.token===tokens.Num){ arrSize=this.tokenvalue; this.nexttokens(); }
          if(this.token===93) this.nexttokens(); else throw new Error(`${this.line}: ']' expected`);
        }
  
        let init = null;
        if(this.token===tokens.Assign){
          this.nexttokens();
          if(isArray && this.token===123){
            this.nexttokens();
            const vals=[];
            while(this.token!==125){
              if(this.token===tokens.Num){ vals.push(this.tokenvalue); this.nexttokens(); if(this.token===44) this.nexttokens(); }
              else throw new Error(`${this.line}: bad initializer`);
            }
            this.nexttokens();
            init = { isArrayInit:true, values:vals, type:declType };
          } else {
            init = this.parseExpr(tokens.Assign);
          }
        }
        decls.push(AST.VarDecl(name, nameIdx, declType, init, isConst, isArray, arrSize, isVolatile));
        if(this.token===44) this.nexttokens(); // comma for next var
      } while(this.token!==59);
      this.nexttokens(); // skip ';'
      return { decls, type:baseType, isConst, isVolatile };
    }
  //file codegen.js
    // ================================================================
    // AST → TAC 代码生成
    // ================================================================

  // @param {boolean} [discard] 调用者不使用表达式结果 (语句级/for 增量),
  //        允许 ++/-- 退化为原地自增, 省去旧值备份与写回搬运.
  genExpr(node, discard) {
    switch(node.kind) {
    case 'IntLiteral':
      this.emit(opcode.MOVI, this.acc, node.val);
      break;
    case 'StringLiteral':
      this.emit(opcode.LDA, this.acc, node.addr);
      break;
    case 'Identifier': {
      const sym = this.sysboltable[node.symIdx];
      if(sym.InReg){
        const r = (-sym.Val)-1;
        if(r !== this.acc) this.emit(opcode.MOV, this.acc, r);
        this._storeTargetReg = r; this._lastSlotOff = -1;
        this._storeTargetType = sym.Arr ? type.INT : sym.Type;
        // struct/union 类型: InReg 存的是地址指针,
        // 还需同步到 tmp2 供 dot member access 做基址 (MemberAccess 用 tmp2 做 dot 偏移)
        if(sym.Type < type.PTR && this.isStructOrUnionType(sym.Type)){
          this.emit(opcode.MOV, this.tmp2, this.acc);
        }
      } else if(sym.Class===tokens.Fun){
        // 函数名作为值: 返回函数地址, 占位 0, 记录 fixup
        this.emit(opcode.MOVI, this.acc, 0); // placeholder
        if(this.backend.inFunc){
          // MOVI 的立即数在 funcCode[funcIp] (最后一个 emit 的字)
          this.backend.funcAddrFixups.push({wordPos:this.backend.funcIp,symIdx:node.symIdx,segIdx:this.backend.funcSegments.length});
        }
        this._storeTargetReg = -1; this._lastSlotOff = -1;
        this._storeTargetType = sym.Arr ? type.INT : sym.Type;
      } else {
        if(sym.Class===tokens.Loc){
          const slotOff = this.loc - sym.Val;
          if(sym.Arr) {
            const arrSz=sym.ArrSize||1;
            this.emit(opcode.LEA, this.acc, slotOff - arrSz + 1);
          } else {
            // 标量局部变量: LOAD_OFF/LOADB_OFF/LOADH_OFF 直接加载值
            // 指针 (Type>=PTR) 同属字大小标量, 必须走这条快路 —— 否则 else 分支的
            // `LEA acc,slotOff` 会把该槽标记为"地址逃逸", 令 peepholeRegAlloc 判定
            // 别名不安全而放弃整个函数的寄存器提升 (指针局部反而被迫留在栈上重载).
            const isStructVal=sym.Type<type.PTR&&this.isStructOrUnionType(sym.Type);
            if(!isStructVal && this._isWordScalarType(sym.Type)){
              this.emit(opcode.LEA, this.tmp2, slotOff);
              this.emit(this.loadOffOp(sym.Type), this.acc, slotOff);
              this._lastSlotOff = slotOff;
            } else {
              this.emit(opcode.LEA, this.acc, slotOff);
              this.emit(opcode.MOV, this.tmp2, this.acc);
              if(!isStructVal) this.emit(this.loadOp(sym.Type), this.acc, this.acc);
              this._lastSlotOff = -1;
            }
          }
        } else {
          this.emit(opcode.LDA, this.acc, sym.Val);
          this.emit(opcode.MOV, this.tmp2, this.acc);
          if(!sym.Arr){
            const isStructVal=sym.Type<type.PTR&&this.isStructOrUnionType(sym.Type);
            if(!isStructVal) this.emit(this.loadOp(sym.Type), this.acc, this.acc);
          }
          this._lastSlotOff = -1;
        }
        this._storeTargetReg = -1; this._lastSlotOff = -1;
        this._storeTargetType = sym.Arr ? type.INT : sym.Type;
      }
      break;
    }
    case 'BinaryOp':
      // ② 常量折叠: 两操作数均为编译期常量 → 直接求值折叠为单个 MOVI (省运行时计算).
      //    例: sizeof(initdata)/4 → MOVI acc,12; 后续比较 i<12 走 LICM 立即数路径发 CMPI.
      {
        const lk = this._getConstantVal(node.left);
        const rk = this._getConstantVal(node.right);
        if(lk !== null && rk !== null){
          const fv = this._foldBinConst(node.opTok, lk, rk);
          if(fv !== null){ this.emit(opcode.MOVI, this.acc, fv); break; }
        }
      }
      // Power-of-2 div/mod → 有符号安全移位序列 (省 DIV/MOD 指令, 为 Thumb 后端铺路)
      if(node.right.kind==='IntLiteral' && !this._isPtrNode(node.left)){
        const pv = node.right.val;
        if(this._isPow2(pv) && (node.opToken===tokens.Div || node.opToken===tokens.Mod)){
          this.genExpr(node.left);
          if(node.opToken===tokens.Div) this._emitPow2Div(pv);
          else this._emitPow2Mod(pv);
          break;
        }
      }
      // LICM: reg OP 常量 → 立即数形式 (省 PUSH/POP), 跳过指针算术.
      // 支持编译期常量表达式 (如 sizeof(X)/4) 经 _getConstantVal 求值后直接发 CMPI.
      // 注意用 _binTokToTAC (未知 token 返回 -1) 而非 _opToTAC (未知返回 0 == ADD),
      // 否则 ADD(=0) 会被 `baseOp>0` 误排除, 加法退回慢速 PUSH/POP 路径.
      {
        const rc = this._getConstantVal(node.right);
        if(rc !== null && node.left.kind==='Identifier'
           && !(node.opToken===tokens.Shl||node.opToken===tokens.Shr) && !this._isPtrNode(node.left)){
          const baseOp = this._binTokToTAC(node.opToken);
          if(baseOp>=0 && baseOp<=15){
            this.genExpr(node.left);  // 值 → acc
            this._emitThumbSafeRI(baseOp, this.acc, this.acc, rc);  // acc = left OP rc ✓
            break;
          }
        }
      }
      // 左常量 (const OP reg): 立即数形式只能算 `reg OP imm`, 故必须先把运算符
      // 换成"操作数交换后仍等价"的形式, 否则语义反了 (100-y 会被算成 y-100).
      //   可交换: + * & | ^ == !=   → 运算符不变
      //   比较:   c<e ≡ e>c, c>e ≡ e<c, c<=e ≡ e>=c, c>=e ≡ e<=c → 反转方向
      //   - / %:  无等价交换形式     → 退回下方通用 PUSH/POP 路径
      {
        const lc = this._getConstantVal(node.left);
        if(lc !== null && node.right.kind==='Identifier'
           && !(node.opToken===tokens.Shl||node.opToken===tokens.Shr) && !this._isPtrNode(node.right)){
          const swapTok = this._swapOperandsTok(node.opToken);
          if(swapTok !== null){
            const baseOp = this._binTokToTAC(swapTok);
            if(baseOp>=0 && baseOp<=15){
              this.genExpr(node.right);
              this._emitThumbSafeRI(baseOp, this.acc, this.acc, lc);  // acc = right SWAP lc ≡ lc OP right ✓
              break;
            }
          }
        }
      }
      this.genExpr(node.left);
      this.emit(opcode.PUSH, this.acc);
      this.genExpr(node.right);
      this.emit(opcode.POP, this.tmp1);
      // 指针算术处理: pk=leftPtr/rightPtr/bothPtr/null
      const pk=this._ptrArithKind(node);
      if(pk==='bothPtr'&&node.opToken===tokens.Sub){
        const ps=this._ptrArithScale(node);
        this.emit(opcode.SUB, this.acc, this.tmp1, this.acc);
        if(ps>1) this._emitThumbSafeRI(opcode.DIV, this.acc, this.acc, ps);
      }else if(pk==='leftPtr'){
        const ps=this._ptrArithScale(node);
        if(ps>1) this._emitThumbSafeRI(opcode.MUL, this.acc, this.acc, ps);
        this.emit(this._opToTAC(node.opToken), this.acc, this.tmp1, this.acc);
      }else if(pk==='rightPtr'){
        const ps=this._ptrArithScale(node);
        if(ps>1) this._emitThumbSafeRI(opcode.MUL, this.tmp1, this.tmp1, ps);
        this.emit(this._opToTAC(node.opToken), this.acc, this.tmp1, this.acc);
      }else{
        this.emit(this._opToTAC(node.opToken), this.acc, this.tmp1, this.acc);
      }
      break;
    case 'UnaryOp':
      this.genExpr(node.operand);
      if(node.opToken==='!'){
        this.emit(opcode.MOV, this.tmp1, this.acc);
        this.emit(opcode.MOVI, this.acc, 0);
        this.emit(opcode.EQ, this.acc, this.tmp1, this.acc);
      } else if(node.opToken==='~'){
        this._emitThumbSafeRI(opcode.XOR, this.acc, this.acc, -1);
      } else if(node.opToken==='-'){
        this._emitThumbSafeRI(opcode.MUL, this.acc, this.acc, -1);
      }
      break;
    case 'PrefixOp':
    case 'PostfixOp': {
      // 直接发 ADDI/SUBI 立即数 (而非 ADD/SUB acc,acc,tmp1), 避免后端为 +1 物化一个
      // step 临时寄存器 (如 R3=#1) 并在循环增量/位测试间被迫 PUSH/POP 保护 -> 省栈往返.
      const isPost = node.kind==='PostfixOp';
      const ptrSz=this._ptrIncScale(node.expr);
      const inc=ptrSz>1?ptrSz:1;
      const incOp = node.opToken==='++' ? opcode.ADDI : opcode.SUBI;
      if(typeof process!=='undefined'&&process.env.C4_NO_INCOPT) discard = false; // 诊断开关: 回到旧行为
      // ---- 结果被丢弃 (语句级 / for 增量) ----
      // ① 后缀不再需要"备份旧值 + 末尾恢复"两条 MOV (旧值无人使用);
      // ② 若目标是寄存器驻留的标量局部, 直接原地自增, 再省 MOV acc,r / MOV r,acc.
      //    空循环 `for(i=0;i<N;i++);` 的增量由 5 条 TAC 降到 1 条.
      if(discard && node.expr.kind==='Identifier'){
        const sym=this.sysboltable[node.expr.symIdx];
        if(sym && sym.InReg && !sym.Volatile && !sym.Arr){
          const r=(-sym.Val)-1;
          this.emit(incOp, r, r, inc);
          this._storeTargetReg=-1; this._lastSlotOff=-1;
          break;
        }
      }
      this.genExpr(node.expr);
      if(isPost && !discard) this.emit(opcode.MOV, this.tmp1, this.acc);
      this.emit(incOp, this.acc, this.acc, inc);
      if(this._storeTargetReg < 0) this._emitStore(this.tmp2, this.acc);
      this._syncStore();
      if(isPost && !discard) this.emit(opcode.MOV, this.acc, this.tmp1);
      break;
    }
    case 'Assign':
      if(node.isCompound){
        // 复合赋值: 先求值左值 (需要旧值在 acc 做复合运算)
        this.genExpr(node.target);
        const isTargetInReg = this._storeTargetReg >= 0;
        // 快照目标写回状态: genExpr(node.value) 内部读取变量会覆盖
        // _storeTargetReg/_lastSlotOff/_storeTargetType, 导致结果写错寄存器/槽位
        // (例: s+=i*i 中 s=R4 被 i=R6 覆盖, 结果 MOV r6,r0 破坏 i 且 s 永不更新)
        const savedTargetReg = this._storeTargetReg;
        const savedSlotOff = this._lastSlotOff;
        const savedTargetType = this._storeTargetType;
        const immVal = this._getConstantVal(node.value);
        if(immVal !== null){
          // Power-of-2 复合 div/mod → 移位序列
          if(this._isPow2(immVal) && (node.compoundToken===tokens.DivAssign || node.compoundToken===tokens.ModAssign)){
            if(node.compoundToken===tokens.DivAssign) this._emitPow2Div(immVal);
            else this._emitPow2Mod(immVal);
            if(!isTargetInReg) this._emitStore(this.tmp2, this.acc);
            this._syncStore();
            break;
          }
          const baseOp = this._opToTAC(node.compoundToken);
          if(baseOp >= 0 && baseOp <= 15){
            this._emitThumbSafeRI(baseOp, this.acc, this.acc, immVal);
            if(!isTargetInReg) this._emitStore(this.tmp2, this.acc);
            this._syncStore();
            break;
          }
        }
        // 通用复合赋值: target = target OP value
        if(!isTargetInReg) this.emit(opcode.PUSH, this.tmp2);
        this.emit(opcode.PUSH, this.acc);
        this.genExpr(node.value);
        // 恢复目标写回状态 (被 genExpr(node.value) 破坏, 见上方快照注释)
        this._storeTargetReg = savedTargetReg;
        this._lastSlotOff = savedSlotOff;
        this._storeTargetType = savedTargetType;
        this.emit(opcode.POP, this.tmp1);
        if(!isTargetInReg) this.emit(opcode.POP, this.tmp2);
        this.emit(this._opToTAC(node.compoundToken), this.acc, this.tmp1, this.acc);
        if(!isTargetInReg) this._emitStore(this.tmp2, this.acc);
        this._syncStore();
      } else {
        // 简单赋值: 检测标量局部变量直接写 → STORE_OFF (省 LEA+MOV+STORE)
        if(node.target.kind==='Identifier'){
          const tsym=this.sysboltable[node.target.symIdx];
          if(tsym && tsym.Class===tokens.Loc && !tsym.Arr && !tsym.InReg
             && this._isWordScalarType(tsym.Type)){
            this.genExpr(node.value);
            if(tsym.Volatile) this.emit(opcode.VB); // volatile: 插入优化屏障
            this.emit(this.storeOffOp(tsym.Type), this.loc - tsym.Val, this.acc);
            break;
          }
        }
        // 通用路径: 先求值右值以避免 genExpr(target) 破坏参数寄存器 (如 R0)
        this.genExpr(node.value);
        this.emit(opcode.PUSH, this.acc);
        // 检测目标是否为 volatile 变量
        let targetVolatile = false;
        if(node.target && node.target.kind === 'Identifier'){
          const tsym = this.sysboltable[node.target.symIdx];
          if(tsym && tsym.Volatile) targetVolatile = true;
        }
        this.genExpr(node.target);
        this.emit(opcode.POP, this.acc);
        if(targetVolatile) this.emit(opcode.VB); // volatile: 插入优化屏障
        if(this._storeTargetReg < 0){
          // struct/union 赋值 → 完整内存拷贝
          if(this._storeTargetType>=type.STRUCT && this._storeTargetType<type.PTR){
            // _storeTargetType 包含 struct/union 类型索引
            let sIdx;
            if(this._storeTargetType<type.PTR) sIdx=this._storeTargetType-type.STRUCT;
            else sIdx=this._storeTargetType-type.UNION;
            const sz=sIdx>=0&&sIdx<this.structDefs.length?this.structDefs[sIdx].size:4;
            const nWords=sz>>2;
            // acc = src addr, tmp2 = dst addr
            // 用 tmp3 保存 src 地址, 逐字 LOAD/STORE
            this.emit(opcode.MOV, this.tmp3, this.acc);
            for(let w=0;w<nWords;w++){
              if(w>0){
                this.emit(opcode.ADDI, this.tmp3, this.tmp3, 4);
                this.emit(opcode.ADDI, this.tmp2, this.tmp2, 4);
              }
              this.emit(opcode.LOAD, this.acc, this.tmp3);
              this.emit(opcode.STORE, this.tmp2, this.acc);
            }
          }else{
            this.emit(this.storeOp(this._storeTargetType), this.tmp2, this.acc);
          }
        }
        this._syncStore();
      }
      break;
    case 'FunctionCall': {
      const n = node.args.length;
      const saved = {acc:this.acc, tmp1:this.tmp1, tmp2:this.tmp2, tmp3:this.tmp3};
      const sym = this.sysboltable[node.symIdx];
      const isSysCall = sym && sym.Class === tokens.Sys;
      const isFuncPtr = (node.calleeExpr) || (sym && sym.Class !== tokens.Fun && !isSysCall);
      // 函数指针调用: 先求值函数地址, 保存到 R7 (callee-saved, 不参与临时寄存器分配)
      if(isFuncPtr){
        // (*fp)(args): Dereference of function ptr → 直接加载指针值, 跳过 LOAD
        if(node.calleeExpr && node.calleeExpr.kind === 'Dereference'){
          this.genExpr(node.calleeExpr.ptr);
        } else {
          this.genExpr(node.calleeExpr || {kind:'Identifier',symIdx:node.symIdx});
        }
        this.emit(opcode.MOV, 7, this.acc); // 函数地址 → R7
        Object.assign(this, saved);
      }
      // 反向求值: 右→左, 每个参数直接求值到目标寄存器 Ri
      // 跨调用保护: R1-R3 是 caller-saved, 后续(更低下标)实参若含函数调用,
      // 其 CALL/SYS_CALL 会杀伤已求值的 Ri → 先 PUSH 保护, 全部实参求值后 POP 恢复.
      // (否则如 printf("%d %d",g(1),g(2)) 中 g(2) 的结果驻留 R2 会被 g(1) 的调用踩掉)
      const protPushed = [];
      for(let i = n - 1; i >= 0; i--){
        if(i < 4){
          let reserved = 0;
          for(let j = i + 1; j < n && j < 4; j++) reserved |= (1 << j);
          reserved |= 0x80; // 预留 R7 (函数指针)
          this._setupRegs(i, reserved);
          this.genExpr(node.args[i]);
          if(i > 0){
            let laterHasCall = false;
            for(let j = 0; j < i; j++){ if(this._exprHasCall(node.args[j])){ laterHasCall = true; break; } }
            if(laterHasCall){ this.emit(opcode.PUSH, i); protPushed.push(i); }
          }
        } else {
          this._setupRegs(0);
          this.genExpr(node.args[i]);
          this.emit(opcode.PUSH, this.acc);
        }
      }
      Object.assign(this, saved);
      // 恢复被保护的实参: PUSH 按 i 降序发生, POP 按 i 升序 (LIFO 配对)
      if(protPushed.length){
        protPushed.sort((x,y)=>x-y);
        for(const ri of protPushed) this.emit(opcode.POP, ri);
      }
      if(isSysCall){
        const pushCount = Math.min(n, 4);
        for(let i=0;i<pushCount;i++) this.emit(opcode.PUSH, i);
        this.emit(opcode.SYS_CALL, sym.Val, n);
        if(n>0) this.emit(opcode.ADJ, n);
      } else if(isFuncPtr){
        this.emit(opcode.CALLR, 7);
        if(this.acc !== 0) this.emit(opcode.MOV, this.acc, 0); // BLX→R0, 移到目标寄存器
      } else {
        const callPos = this.backend.here();
        this.emit(opcode.CALL, 0);
        this.backend.recordCallFixup(callPos, node.symIdx);
        if(this.acc !== 0) this.emit(opcode.MOV, this.acc, 0); // BL→R0, 移到目标寄存器
      }
      const spilled = Math.max(0, n-4);
      if(spilled > 0) this.emit(opcode.ADJ, spilled);
      break;
    }
    case 'SizeOfType':
      this.emit(opcode.MOVI, this.acc, this.typeSize(node.type));
      break;
    case 'SizeOfExpr':
      this.genExpr(node.expr);
      break;
    case 'CastExpr':
      this.genExpr(node.expr);
      if(node.targetType===type.CHAR) this._emitThumbSafeRI(opcode.AND, this.acc, this.acc, 0xFF);
      else if(node.targetType===type.SHORT) this._emitThumbSafeRI(opcode.AND, this.acc, this.acc, 0xFFFF);
      break;
    case 'AddressOf': {
      // &*p = p: cancel out dereference
      if(node.expr && node.expr.kind === 'Dereference'){
        this.genExpr(node.expr.ptr);
        break;
      }
      // &Identifier: 返回地址 (不 emit LOAD)
      if(node.expr && node.expr.kind === 'Identifier'){
        const sym = this.sysboltable[node.expr.symIdx];
        if(sym){
          // &funcName ≡ funcName —— 函数取地址必须走 Identifier 的 MOVI 占位 + funcAddrFixups
          // 路径, 绝不可落到下面的 LDA sym.Val (那是把函数当数据符号取地址).
          // Reg VM 里 sym.Val 恰等于函数 TAC 地址故侥幸可用, 但 M0 的 ASM 地址与 TAC 地址
          // 无关 —— 旧代码使 fp=&add 跳到地址 0, 顺着零填充数据区一路"执行"到第一个函数,
          // 测试 func ptr with & 只因 add(10,20)==30 与首函数结果巧合相同才误判通过.
          if(sym.Class===tokens.Fun){ this.genExpr(node.expr); break; }
          if(sym.InReg){
            this._reserveSaveSlots();
            const stackSlot = ++this._localVarIdx;
            const regNum = (-sym.Val) - 1;
            this.emit(opcode.LEA, this.acc, this.loc - stackSlot);
            this.emit(opcode.STORE, this.acc, regNum);
            sym.Val = stackSlot; sym.InReg = 0;
            break;
          }
          if(sym.Class===tokens.Loc) this.emit(opcode.LEA, this.acc, this.loc-sym.Val);
          else this.emit(opcode.LDA, this.acc, sym.Val);
          break;
        }
      }
      this.genExpr(node.expr);
      break;
    }
    case 'Dereference':
      this.genExpr(node.ptr);
      this.emit(opcode.MOV, this.tmp2, this.acc);
      this.emit(opcode.LOAD, this.acc, this.acc);
      this._storeTargetReg = -1; // value is from memory, not a register
      break;
    case 'Conditional': {
      this.genExpr(node.cond);
      const _condJZLbl=this.backend.allocLabel();
      this.emit(opcode.JZ, this.acc, -_condJZLbl);
      this.genExpr(node.thenExpr);
      const _condJMPLbl=this.backend.allocLabel();
      this.emit(opcode.JMP, -_condJMPLbl);
      this.backend.setLabel(_condJZLbl);
      this.genExpr(node.elseExpr);
      this.backend.setLabel(_condJMPLbl);
      break;
    }
    case 'LogicalAnd':
      this.genExpr(node.left);
      const _landLbl=this.backend.allocLabel();
      this.emit(opcode.JZ, this.acc, -_landLbl);
      this.genExpr(node.right);
      this.backend.setLabel(_landLbl);
      break;
    case 'LogicalOr':
      this.genExpr(node.left);
      const _lorLbl=this.backend.allocLabel();
      this.emit(opcode.JNZ, this.acc, -_lorLbl);
      this.genExpr(node.right);
      this.backend.setLabel(_lorLbl);
      break;
    case 'Subscript':{
      // 常量下标 + 局部数组 → LOAD_OFF 直接计算 slot 偏移
      if(node.index.kind==='IntLiteral' && node.base.kind==='Identifier'){
        const bSym=this.sysboltable[node.base.symIdx];
        if(bSym && bSym.Class===tokens.Loc && bSym.Arr){
          const elSz=this._subscrElemSize(node);
          if(elSz===4){ // 仅 word 对齐元素可用 LOAD_OFF
            const arrBase=this.loc - bSym.Val - (bSym.ArrSize||1) + 1;
            const slotOff=arrBase + node.index.val;
            this.emit(opcode.LEA, this.tmp2, slotOff);
            this.emit(opcode.LOAD_OFF, this.acc, slotOff);
            this._storeTargetReg=-1; this._lastSlotOff=slotOff;
            break;
          }
        }
      }
      this.genExpr(node.base);
      this.emit(opcode.PUSH, this.acc);
      this.genExpr(node.index);
      this.emit(opcode.POP, this.tmp1);
      {const elSz=this._subscrElemSize(node);const lOp=this._subscrLoadOp(node);
      if(elSz>1) this._emitThumbSafeRI(opcode.MUL, this.acc, this.acc, elSz);
      this.emit(opcode.ADD, this.acc, this.tmp1, this.acc);
      this.emit(opcode.MOV, this.tmp2, this.acc);
      this.emit(lOp, this.acc, this.acc);}
      this._storeTargetReg = -1; this._lastSlotOff = -1;
      break;
    }
    case 'MemberAccess': {
      // 计算基地址 (genExpr 后, acc 栈值或指针值; tmp2 地址)
      this.genExpr(node.obj);
      // arrow(指针)用 acc(指针值) 做偏移; 点号用 tmp2(地址) 做偏移
      const baseReg = node.isArrow ? this.acc : this.tmp2;
      if(node.memberOffset>0){
        this.emit(opcode.MOVI,this.tmp1,node.memberOffset);
        this.emit(opcode.ADD,baseReg,baseReg,this.tmp1);
      }
      this.emit(opcode.MOV,this.tmp2,baseReg);
      this._storeTargetType=node.memberType;
      // struct 类型成员保留地址; 标量加载值
      if(node.memberType>=type.STRUCT&&node.memberType<type.PTR){
        this.emit(opcode.MOV,this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }else{
        this.emit(this.loadOp(node.memberType),this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }
      break;
    }
    default:
      throw new Error(`genExpr: unknown kind ${node.kind}`);
    }
    return this.acc;
  }
;

  // reg VM 的 ENTER 把 callee-saved (R4/R6/R7) 保存到 bp-4..bp-12, 而栈局部偏移
  // 也从 bp-4 (off=-1) 起 —— 两区重叠: 局部数组/溢出标量会踩坏保存区, LEAVE 恢复
  // 出脏值破坏调用者 (t_frame: f 的 a[2]=33 踩掉 caller keep=100 的 R4 保存槽).
  // 修复: 函数内首次分配栈槽时预留 3 槽 (保存区上限), 栈局部从 bp-16 起.
  // 无栈局部的函数零开销; Thumb 后端仅多 12B 栈深, 无代码体积成本.
  _reserveSaveSlots(){
    if(typeof process!=='undefined'&&process.env.C4_NO_RESV) return; // 临时诊断开关
    if(!this._saveSlotsResv){ this._saveSlotsResv=true; this._localVarIdx+=3; }
  };

  genStmt(node) {
    const savedLine=this.stmtLine;
    if(node._stmtLine>0) this.stmtLine=node._stmtLine;
    switch(node.kind) {
    case 'ExprStmt':
      if(node.expr.kind==='DeclStmt'){
        // 局部变量声明
        const {decls}=node.expr.decls;
        for(const d of decls){
          const lsym=this.sysboltable[d.symIdx];
          lsym.Class=tokens.Loc; lsym.Type=d.type;
          if(d.isArray){ lsym.Type+=type.PTR; lsym.Arr=1; }
          lsym.Const=d.isConst?1:0;
          lsym.Volatile=d.isVolatile?1:0;
          const isScalar=(d.type===type.INT||d.type===type.SHORT||d.type===type.CHAR);
          const calleeReg=isScalar?this.allocCalleeReg():-1;
          if(!d.isArray&&calleeReg>=0){
            lsym.Val=-(calleeReg+1); lsym.InReg=1;
          }else if(d.isArray){
            // 数组: 分配足够元素空间
            const initLen=d.init&&d.init.isArrayInit?d.init.values.length:0;
            let arrSlots=Math.max(d.arrSize||0, initLen, 1);
            // struct/union 数组需要乘以元素大小(字)
            const rawType=d.type>=type.PTR?d.type-type.PTR:d.type;
            if(rawType>=type.STRUCT&&rawType-type.STRUCT<this.structDefs.length){
              const elSz=this.structDefs[rawType-type.STRUCT].size;
              arrSlots*=Math.ceil(elSz/4);
            }
            this._reserveSaveSlots();
            lsym.Val=this._localVarIdx+1;
            lsym.ArrSize=arrSlots;
            this._localVarIdx+=arrSlots;
            lsym.InReg=0;
          }else if(d.type<type.PTR&&this.isStructOrUnionType(d.type)){
            // struct/union 值类型: 取负偏移使所有成员在栈帧内
            const sIdx=this.getStructDefIndex(d.type);
            const sz=sIdx>=0?this.structDefs[sIdx].size:4;
            const slots=Math.ceil(sz/4);
            // 基地址在最后一个槽, 成员向上扩展
            this._reserveSaveSlots();
            lsym.Val=this._localVarIdx+slots;
            this._localVarIdx+=slots;
            lsym.InReg=0;
          }else{
            this._reserveSaveSlots();
            lsym.Val=++this._localVarIdx; lsym.InReg=0;
          }
          if(d.init){
            if(d.isArray&&d.init.isArrayInit){
              for(let k=0;k<d.init.values.length;k++){
                const arrBaseOff=this.loc-lsym.Val-lsym.ArrSize+1;
                this.emit(opcode.MOVI,1,d.init.values[k]);
                this.emit(this.storeOffOp(d.type), arrBaseOff+k, 1);
              }
            }else{
              this.genExpr(d.init);
              if(lsym.InReg){
                const regNum=(-lsym.Val)-1;
                if(regNum!==this.acc)this.emit(opcode.MOV,regNum,this.acc);
              }else{
                this.emit(opcode.MOV,this.tmp1,this.acc);
                this.emit(this.storeOffOp(lsym.Type), this.loc - lsym.Val, this.tmp1);
              }
            }
          }
        }
        break;
      }
      this.genExpr(node.expr, true); // 语句级: 结果丢弃
      break;
    case 'Block':
      for(const s of node.stmts) this.genStmt(s);
      break;
    case 'IfStmt':
      const ifJZ = this._genCondJmp(node.cond, true); // label ID (>0) 或 -1 (fallback)
      let ifJZLbl = ifJZ;
      if(ifJZ < 0){
        this.genExpr(node.cond);
        ifJZLbl = this.backend.allocLabel();
        this.emit(opcode.JZ, this.acc, -ifJZLbl);
      }
      this.genStmt(node.thenStmt);
      if(node.elseStmt){
        const _ifElseLbl=this.backend.allocLabel();
        this.emit(opcode.JMP, -_ifElseLbl);
        this.backend.setLabel(ifJZLbl);
        this.genStmt(node.elseStmt);
        this.backend.setLabel(_ifElseLbl);
      } else {
        this.backend.setLabel(ifJZLbl);
      }
      break;
    case 'ForStmt': {
      // 底测布局 (bottom-test): 条件与增量置于循环体之后, 每轮只剩 1 次回跳.
      //   init; JMP Lcond; Lbody: body; Linc: incr; Lcond: cond? → Lbody; Lexit:
      // 旧的顶测布局每轮要走 Jcc + JMP(进 body) + JMP(回 incr) + JMP(回 cond) 共 3 次
      // 无条件跳转; 空循环体时开销占比极大 (rstdelay 的 for(i=0;i<160;i++);).
      // 条件求值次数与顶测完全相同 (入口跳一次条件), 语义等价.
      this.genExpr(node.init, true);
      const _forCondLbl=this.backend.allocLabel();
      this.emit(opcode.JMP, -_forCondLbl);   // 进入循环: 先测条件 (仅执行一次)
      const _forBodyLbl=this.backend.allocLabel();
      this.backend.setLabel(_forBodyLbl);
      this.loopStack.push({breakFixes:[], contFixes:[]});
      this.genStmt(node.body);
      const lp = this.loopStack.pop();
      const _forIncrLbl=this.backend.allocLabel();
      this.backend.setLabel(_forIncrLbl);
      this.genExpr(node.incr, true); // 增量表达式: 结果丢弃
      this.backend.setLabel(_forCondLbl);
      const forP = this._genCondJmp(node.cond, false); // 条件为真 → 回到 body
      if(forP >= 0){
        this.backend.setLabelAt(forP, this.backend._labels[_forBodyLbl]);
      } else {
        this.genExpr(node.cond);
        this.emit(opcode.JNZ, this.acc, -_forBodyLbl);
      }
      for(const f of lp.breakFixes) this.backend.setLabel(f);
      for(const f of lp.contFixes) this.backend.setLabelAt(f, this.backend._labels[_forIncrLbl]);
      break;
    }
    case 'WhileStmt': {
      // 同 ForStmt: 底测布局, 每轮 1 次回跳 (旧布局为 Jcc + JMP 两次)
      const _whileCondLbl=this.backend.allocLabel();
      this.emit(opcode.JMP, -_whileCondLbl);
      const _whileBodyLbl=this.backend.allocLabel();
      this.backend.setLabel(_whileBodyLbl);
      this.loopStack.push({breakFixes:[], contFixes:[]});
      this.genStmt(node.body);
      const wlp = this.loopStack.pop();
      this.backend.setLabel(_whileCondLbl);
      const whileP = this._genCondJmp(node.cond, false);
      if(whileP >= 0){
        this.backend.setLabelAt(whileP, this.backend._labels[_whileBodyLbl]);
      } else {
        this.genExpr(node.cond);
        this.emit(opcode.JNZ, this.acc, -_whileBodyLbl);
      }
      for(const f of wlp.breakFixes) this.backend.setLabel(f);
      for(const f of wlp.contFixes) this.backend.setLabelAt(f, this.backend._labels[_whileCondLbl]);
      break;
    }
    case 'DoWhileStmt':
      // do-while: 先执行体, 再检查条件
      const _doTopLbl=this.backend.allocLabel();
      this.backend.setLabel(_doTopLbl);
      this.loopStack.push({breakFixes:[], contFixes:[]});
      this.genStmt(node.body);
      const dlp = this.loopStack.pop();
      const doP = this._genCondJmp(node.cond, false);
      if(doP >= 0){
        // 将 _genCondJmp 返回的标签重定向到 _doTopLbl (链接到 Jcc 标签表项)
        this.backend.setLabelAt(doP, this.backend._labels[_doTopLbl]);
      } else {
        this.genExpr(node.cond);
        this.emit(opcode.JNZ, this.acc, -_doTopLbl);
      }
      for(const f of dlp.breakFixes) this.backend.setLabel(f);
      for(const f of dlp.contFixes) this.backend.setLabelAt(f, this.backend._labels[_doTopLbl]);
      break;
    case 'ReturnStmt':
      if(node.expr) this.genExpr(node.expr);
      this.emit(opcode.LEAVE, this._calleeMask | (this._isLeaf ? 0x100 : 0));
      break;
    case 'BreakStmt': {
      let inSwitch = false;
      if(this.switchStack.length > 0){
        const sw = this.switchStack[this.switchStack.length-1];
        const _brLbl=this.backend.allocLabel();
        this.emit(opcode.JMP, -_brLbl);
        sw.breakFixes.push(_brLbl);
        inSwitch = true;
      }
      if(!inSwitch && this.loopStack.length > 0){
        const lp = this.loopStack[this.loopStack.length-1];
        const _brLbl=this.backend.allocLabel();
        this.emit(opcode.JMP, -_brLbl);
        lp.breakFixes.push(_brLbl);
      }
      if(!inSwitch && this.loopStack.length === 0){
        throw new Error(`${this.stmtLine}: break outside loop or switch`);
      }
      break;
    }
    case 'ContinueStmt':
      if(this.loopStack.length > 0){
        const lp = this.loopStack[this.loopStack.length-1];
        const _contLbl=this.backend.allocLabel();
        this.emit(opcode.JMP, -_contLbl);
        lp.contFixes.push(_contLbl);
      } else {
        throw new Error(`${this.stmtLine}: continue outside loop`);
      }
      break;
    case 'SwitchStmt':
      this.genExpr(node.expr);
      this.emit(opcode.MOV, this.tmp3, this.acc);
      const swCtx = {breakFixes:[]};
      this.switchStack.push(swCtx);
      for(const c of node.cases){
        if(c.kind==='CaseStmt'){
          this._emitThumbSafeRI(opcode.EQ, this.tmp1, this.tmp3, c.value);
          const _caseSkipLbl=this.backend.allocLabel();
          this.emit(opcode.JZ, this.tmp1, -_caseSkipLbl);
          for(const s of c.body) this.genStmt(s);
          this.backend.setLabel(_caseSkipLbl);
        } else {
          for(const s of c.body) this.genStmt(s);
        }
      }
      this.switchStack.pop();
      for(const f of swCtx.breakFixes) this.backend.setLabel(f);
      break;
    case 'MemberAccess': {
      // 计算基地址 (genExpr 后, acc 栈值或指针值; tmp2 地址)
      this.genExpr(node.obj);
      // arrow(指针)用 acc(指针值) 做偏移; 点号用 tmp2(地址) 做偏移
      const baseReg = node.isArrow ? this.acc : this.tmp2;
      if(node.memberOffset>0){
        this.emit(opcode.MOVI,this.tmp1,node.memberOffset);
        this.emit(opcode.ADD,baseReg,baseReg,this.tmp1);
      }
      this.emit(opcode.MOV,this.tmp2,baseReg);
      this._storeTargetType=node.memberType;
      // struct 类型成员保留地址; 标量加载值
      if(node.memberType>=type.STRUCT&&node.memberType<type.PTR){
        this.emit(opcode.MOV,this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }else{
        this.emit(this.loadOp(node.memberType),this.acc,this.tmp2);
        this._storeTargetReg=-1;
      }
      break;
    }
    default:
      throw new Error(`genStmt: unknown kind ${node.kind}`);
    }
    this.stmtLine=savedLine;
  }

  // 二元 token → TAC opcode 映射;

  _opToTAC(tok) {
    const m={};
    m[tokens.Or]=opcode.OR; m[tokens.Xor]=opcode.XOR; m[tokens.And]=opcode.AND;
    m[tokens.Eq]=opcode.EQ; m[tokens.Ne]=opcode.NE;
    m[tokens.Lt]=opcode.LT; m[tokens.Gt]=opcode.GT; m[tokens.Le]=opcode.LE; m[tokens.Ge]=opcode.GE;
    m[tokens.Shl]=opcode.SHL; m[tokens.Shr]=opcode.SHR;
    m[tokens.Add]=opcode.ADD; m[tokens.Sub]=opcode.SUB;
    m[tokens.Mul]=opcode.MUL; m[tokens.Div]=opcode.DIV; m[tokens.Mod]=opcode.MOD;
    m[tokens.AddAssign]=opcode.ADD; m[tokens.SubAssign]=opcode.SUB;
    m[tokens.MulAssign]=opcode.MUL; m[tokens.DivAssign]=opcode.DIV; m[tokens.ModAssign]=opcode.MOD;
    m[tokens.ShlAssign]=opcode.SHL; m[tokens.ShrAssign]=opcode.SHR;
    m[tokens.AndAssign]=opcode.AND; m[tokens.OrAssign]=opcode.OR; m[tokens.XorAssign]=opcode.XOR;
    return m[tok]||0;
  }

  // 二元运算 token → TAC opcode; 未知 token 返回 -1.
  // 与 _opToTAC 的区别: _opToTAC 对未知 token 返回 0, 而 0 == opcode.ADD,
  // 调用点无法用返回值区分"加法"与"不认识", 只能用 `>0` 过滤, 结果连加法一起排除.
  // 需要精确判定的立即数优化路径一律用本函数.

  _binTokToTAC(tok) {
    const m={};
    m[tokens.Add]=opcode.ADD; m[tokens.Sub]=opcode.SUB; m[tokens.Mul]=opcode.MUL;
    m[tokens.Div]=opcode.DIV; m[tokens.Mod]=opcode.MOD;
    m[tokens.Or]=opcode.OR;   m[tokens.Xor]=opcode.XOR; m[tokens.And]=opcode.AND;
    m[tokens.Shl]=opcode.SHL; m[tokens.Shr]=opcode.SHR;
    m[tokens.Eq]=opcode.EQ;   m[tokens.Ne]=opcode.NE;
    m[tokens.Lt]=opcode.LT;   m[tokens.Gt]=opcode.GT;
    m[tokens.Le]=opcode.LE;   m[tokens.Ge]=opcode.GE;
    return m[tok]!==undefined ? m[tok] : -1;
  }

  // 交换两个操作数后仍等价的运算符; 无等价形式返回 null.
  //   a+b≡b+a  a*b≡b*a  a&b≡b&a  a|b≡b|a  a^b≡b^a  a==b≡b==a  a!=b≡b!=a
  //   a<b≡b>a  a>b≡b<a  a<=b≡b>=a  a>=b≡b<=a
  //   a-b, a/b, a%b, a<<b, a>>b 无等价交换形式.

  _swapOperandsTok(tok) {
    if(tok===tokens.Add||tok===tokens.Mul||tok===tokens.And||tok===tokens.Or||
       tok===tokens.Xor||tok===tokens.Eq ||tok===tokens.Ne) return tok;
    if(tok===tokens.Lt) return tokens.Gt;
    if(tok===tokens.Gt) return tokens.Lt;
    if(tok===tokens.Le) return tokens.Ge;
    if(tok===tokens.Ge) return tokens.Le;
    return null;
  }

  // token → Jcc 条件跳转 opcode 映射;

  _cmpToJcc(tok) {
    if(tok===tokens.Eq) return opcode.JEQ;
    if(tok===tokens.Ne) return opcode.JNE;
    if(tok===tokens.Lt) return opcode.JLT;
    if(tok===tokens.Gt) return opcode.JGT;
    if(tok===tokens.Le) return opcode.JLE;
    if(tok===tokens.Ge) return opcode.JGE;
    return 0;
  }
  // 反转条件 (jump when FALSE);

  _invertJcc(op) {
    if(op===opcode.JEQ) return opcode.JNE;
    if(op===opcode.JNE) return opcode.JEQ;
    if(op===opcode.JLT) return opcode.JGE;
    if(op===opcode.JGT) return opcode.JLE;
    if(op===opcode.JLE) return opcode.JGT;
    if(op===opcode.JGE) return opcode.JLT;
    return 0;
  }
  // 交换操作数 (a op b → b op a);

  _swapJcc(op) {
    if(op===opcode.JEQ||op===opcode.JNE) return op;
    if(op===opcode.JLT) return opcode.JGT;
    if(op===opcode.JGT) return opcode.JLT;
    if(op===opcode.JLE) return opcode.JGE;
    if(op===opcode.JGE) return opcode.JLE;
    return 0;
  }
  /**
   * 为控制流生成 CMP + Jcc 模式 (比 EQi+JZ 节省约一半 TAC 字)
   * @param {object} cond - 条件 AST 节点
   * @param {boolean} invert - true=条件假时跳转; false=条件真时跳转
   * @returns {number} 标签 ID (>0), 或 -1 (无法优化, 调用方应 fallback)
   */;

  /**
   * 若节点是"寄存器驻留的标量局部/参数", 返回其物理寄存器号, 否则 -1.
   * 用于比较类上下文直接读寄存器, 免去把值搬进 acc 的死 MOV.
   */;

  _condDirectReg(node) {
    if(typeof process!=='undefined'&&process.env.C4_NO_CMPREG) return -1; // 诊断开关
    if(!node || node.kind!=='Identifier') return -1;
    const sym = this.sysboltable[node.symIdx];
    if(!sym || !sym.InReg || sym.Arr || sym.Volatile) return -1;
    if(sym.Type < type.PTR && this.isStructOrUnionType(sym.Type)) return -1;
    const r = (-sym.Val)-1;
    return (r >= 0 && r < 8) ? r : -1;
  }

  _genCondJmp(cond, invert) {
    if(cond.kind!=='BinaryOp') return -1;
    const jcc=this._cmpToJcc(cond.opToken);
    if(!jcc) return -1;
    if(this._isPtrNode(cond.left)||this._isPtrNode(cond.right)) return -1;
    let useJcc = invert ? this._invertJcc(jcc) : jcc;
    const lbl=this.backend.allocLabel();
    // Right side immediate (含编译期常量表达式, 如 sizeof(X)/4) → CMPI left, imm
    const rc = this._getConstantVal(cond.right);
    if(rc !== null){
      // 变量已驻留寄存器 → 直接 CMPI 该寄存器, 省一条 MOV acc,Rn
      // (CMPI 只置标志, acc 的物化值在此上下文无人使用 —— 但 TAC DCE 是块内的,
      //  跨块 live-out 判定保守, 删不掉这条死 MOV, 故在生成期就别发)
      const dr = this._condDirectReg(cond.left);
      if(dr >= 0){ this.emit(opcode.CMPI, dr, rc); }
      else { this.genExpr(cond.left); this.emit(opcode.CMPI, this.acc, rc); } // [41,rd,imm] 3w
      this.emit(useJcc, -lbl);
      return lbl;
    }
    // Left side immediate → CMPI right, imm, swap Jcc
    const lc = this._getConstantVal(cond.left);
    if(lc !== null){
      const dr = this._condDirectReg(cond.right);
      if(dr >= 0){ this.emit(opcode.CMPI, dr, lc); }
      else { this.genExpr(cond.right); this.emit(opcode.CMPI, this.acc, lc); } // [41,rd,imm] 3w
      this.emit(this._swapJcc(useJcc), -lbl);
      return lbl;
    }
    // Both registers → PUSH left, gen right, POP, CMP
    this.genExpr(cond.left);
    this.emit(opcode.PUSH, this.acc);
    this.genExpr(cond.right);
    this.emit(opcode.POP, this.tmp1);
    this.emit(opcode.CMP, this.tmp1, this.acc);
    this.emit(useJcc, -lbl);
    return lbl;
  }

  // 判断 val 是否为正的 2 的幂;

  _isPow2(val) { return val > 0 && (val & (val-1)) === 0; }

  // 有符号安全除以 2^n: acc = acc / v (v 为正的 2 的幂)
  // C 整除向零截断, 算术右移向负无穷取整, 故需对负数做修正:
  //   t = (x >> 31) & (v-1);  result = (x + t) >> n;

  _emitPow2Div(v) {
    if(v === 1) return; // x/1 = x, 无操作
    const n = 31 - Math.clz32(v);
    this.emit(opcode.MOV, this.tmp1, this.acc);
    this.emit(opcode.SHRI, this.acc, this.acc, 31);
    this._emitThumbSafeRI(opcode.AND, this.acc, this.acc, v - 1);
    this.emit(opcode.ADD, this.acc, this.acc, this.tmp1);
    this.emit(opcode.SHRI, this.acc, this.acc, n);
  }

  // 有符号安全取模 2^n: acc = acc % v (v 为正的 2 的幂)
  // r = x - (x / v) * v, 使用 tmp1 + tmp3 做 scratch (保留 tmp2 供 store-back);

  _emitPow2Mod(v) {
    if(v === 1){ this.emit(opcode.MOVI, this.acc, 0); return; }
    const n = 31 - Math.clz32(v);
    this.emit(opcode.MOV, this.tmp1, this.acc);  // 保存 x
    this.emit(opcode.MOV, this.tmp3, this.acc);  // 保存 x (用于修正)
    this.emit(opcode.SHRI, this.acc, this.acc, 31);  // acc = sign
    this._emitThumbSafeRI(opcode.AND, this.acc, this.acc, v - 1); // acc = sign & (v-1)
    this.emit(opcode.ADD, this.acc, this.acc, this.tmp3); // acc = x + correction
    this.emit(opcode.SHRI, this.acc, this.acc, n);   // q = x / v
    this.emit(opcode.SHLI, this.acc, this.acc, n);   // q * v
    this.emit(opcode.SUB, this.acc, this.tmp1, this.acc); // r = x - q*v
  }

  // 尝试从 AST 节点提取编译期常量 (IntLiteral / ~IntLiteral / -IntLiteral);

  _getConstantVal(node) {
    if(!node || typeof node!=='object') return null;
    if(node.kind==='IntLiteral') return node.val;
    if(node.kind==='UnaryOp' && node.opToken==='~' && node.operand.kind==='IntLiteral')
      return ~node.operand.val;
    if(node.kind==='UnaryOp' && node.opToken==='-' && node.operand.kind==='IntLiteral')
      return -node.operand.val;
    // sizeof(X) — 数组尺寸在 parse 期已折为 IntLiteral(字节数); 存于 .expr 字段
    if(node.kind==='SizeOfExpr' && node.expr && node.expr.kind==='IntLiteral')
      return node.expr.val;
    // 递归常量折叠: 两操作数均为编译期常量时直接求值 (供 ② 常量折叠使用)
    if(node.kind==='BinaryOp'){
      const l=this._getConstantVal(node.left), r=this._getConstantVal(node.right);
      if(l!==null && r!==null) return this._foldBinConst(node.opToken, l, r);
    }
    return null;
  }

  // 编译期二元常量求值 (两操作数均为确定常量时安全). Div/Mod 除零返回 null (跳过).
  // 语义对齐 C: 有符号除法向零截断 (Math.trunc); 移位取 32 位 (|0).
  _foldBinConst(opTok, l, r){
    const m = tokens;
    switch(opTok){
      case m.Add: return (l + r)|0;
      case m.Sub: return (l - r)|0;
      case m.Mul: return (l * r)|0;
      case m.Div: return r===0 ? null : Math.trunc(l / r)|0;
      case m.Mod: return r===0 ? null : (l % r)|0;
      case m.And: return (l & r)|0;
      case m.Or:  return (l | r)|0;
      case m.Xor: return (l ^ r)|0;
      case m.Shl: return (l << r)|0;
      case m.Shr: return (l >> r)|0;
      case m.Eq: return l===r?1:0;
      case m.Ne: return l!==r?1:0;
      case m.Lt: return l<r?1:0;
      case m.Gt: return l>r?1:0;
      case m.Le: return l<=r?1:0;
      case m.Ge: return l>=r?1:0;
      default:   return null;
    }
  }

  /**
   * Thumb 安全 RI 发射: 检查立即数是否可以被单条 Thumb 指令直接表示。
   * 如果超出 Thumb 范围, 自动分解为 MOVI tmp, imm + RR 形式。
   * 这样消除 Thumb 后端中所有 PUSH/POP {R4} 包装, 让 TAC→Thumb 接近 1:1。
   *
   * Thumb M0 约束:
   *   - ADD/SUB Rd, #imm8: imm ∈ [0,255]
   *   - MOV Rd, #imm8: imm ∈ [0,255]
   *   - LSL/ASR Rd, #imm5: imm ∈ [0,31]
   *   - CMP Rd, #imm8: imm ∈ [0,255]
   *   - MUL/DIV/MOD 无立即数形式
   */;

  _emitThumbSafeRI(baseOp, rd, rs, imm) {
    // ---- BIC: x &= ~c 复用正立即数, 让 _tacHoistImm 与 ORI 共享同一物化寄存器 ----
    // 仅当 imm 是某字节 c 的按位取反 (高 24 位全 1) 时安全转为 BIC.
    // TAC BIC rd,rs,rt = rs & ~rt; 欲 rs & imm (imm=~c) → rt=c=(~imm)&0xFF.
    // 额外收益: 正小常量 c(如 0x10) 是 Thumb 合法 MOV #imm(2B, 免字面池), 而 ~c(0xFFFFFFEF) 不是.
    if((typeof process==='undefined'||!process.env.C4_NO_BIC) && baseOp===opcode.AND && imm<0){
      const c=(~imm)>>>0;
      if(c>=0 && c<=255 && imm===(~c)){
        const tmpReg=this.tmp1;
        this.emit(opcode.PUSH, tmpReg);
        this.emit(opcode.MOVI, tmpReg, c);
        this.emit(opcode.BIC, rd, rd, tmpReg);  // R[rd] = R[rd] & ~tmp = rd & ~c = rd & imm
        this.emit(opcode.POP, tmpReg);
        return;
      }
    }
    // ③ 强度削减: 乘 2 的幂 → 移位 (整数左移等价, 有/无符号一致, 省 MOVI+MUL+PUSH/POP).
    //    仅当 rd===rs (MUL 调用点均满足) 时安全; 否则退回通用分解.
    if(baseOp===opcode.MUL && imm>1 && rd===rs && this._isPow2(imm)){
      this.emit(opcode.SHLI, rd, rs, Math.round(Math.log2(imm)));
      return;
    }
    // 特定 baseOp 的安全立即数范围
    const isSafe = (() => {
      switch(baseOp){
        case opcode.ADD: case opcode.SUB: // ADDI/SUBI: ADD/SUB Rd,#imm8 (需为0-255)
          return imm >= 0 && imm < 256;
        case opcode.EQ: case opcode.NE: case opcode.LT:
        case opcode.GT: case opcode.LE: case opcode.GE: // 比较→CMP Rd,#imm8
          return imm >= 0 && imm < 256;
        case opcode.SHL: case opcode.SHR: // LSL/ASR Rd,#imm5
          return imm >= 0 && imm < 32;
        case opcode.AND: case opcode.OR: case opcode.XOR: // ANDI/ORI/XORI: MOV Rd,#imm8
        case opcode.EQ: case opcode.NE: case opcode.LT:
        case opcode.GT: case opcode.LE: case opcode.GE: // 比较→CMP Rd,#imm8
          return imm >= 0 && imm < 256;
        case opcode.SHL: case opcode.SHR: // LSL/ASR Rd,#imm5
          return imm >= 0 && imm < 32;
        case opcode.MUL: // 强制分解: MOVI + MUL RR (Thumb M0 无 MULI 形式)
        case opcode.DIV: case opcode.MOD:
          return false;
        default:
          return imm >= 0 && imm < 256; // 保守
      }
    })();

    if(isSafe){
      this.emit(baseOp + 16, rd, rs, imm);
      return;
    }

    // ---- 分解: PUSH tmp; MOVI tmp, imm; baseOp rd, rs, tmp; POP tmp ----
    // PUSH/POP 保证 scratch 寄存器不与任何上下文中的活值冲突.
    // 例如: ptr 算术中 tmp1 含有基地址; pow2div 中 tmp1 含有保存的 x.
    const is2Op = (baseOp === opcode.AND || baseOp === opcode.OR ||
                   baseOp === opcode.XOR || baseOp === opcode.MUL);
    const isDivMod = (baseOp === opcode.DIV || baseOp === opcode.MOD);
    const tmpReg = this.tmp1;
    this.emit(opcode.PUSH, tmpReg);        // 1 TAC → 1 Thumb: save scratch
    this.emit(opcode.MOVI, tmpReg, imm);   // 1-2 Thumb: load immediate
    if(is2Op){
      this.emit(baseOp, rd, tmpReg, rd);
    } else if(isDivMod){
      this.emit(baseOp, rd, rd, tmpReg);
    } else {
      this.emit(baseOp, rd, rs, tmpReg);
    }
    this.emit(opcode.POP, tmpReg);         // 1 TAC → 1 Thumb: restore scratch
  }

  // 检查 AST 节点是否为指针表达式 (递归支持嵌套二元运算);

  _isPtrNode(node) {
    if(!node||typeof node!=='object') return false;
    if(node.kind==='Identifier'){
      const sym=this.sysboltable[node.symIdx];
      return sym&&sym.Type>=type.PTR;
    }
    if(node.kind==='AddressOf') return true;
    if(node.kind==='StringLiteral') return true;
    if(node.kind==='BinaryOp'&&(node.opToken===tokens.Add||node.opToken===tokens.Sub)){
      return this._isPtrNode(node.left)||this._isPtrNode(node.right);
    }
    return false;
  }

  // 获取指针表达式的元素基类型 (递归)
  // 对于数组符号, 强制返回 type.INT (全局数据按 int32 对齐存储);

  _ptrElemType(node) {
    if(!node||typeof node!=='object') return null;
    if(node.kind==='Identifier'){
      const sym=this.sysboltable[node.symIdx];
      if(!sym) return null;
      if(sym.Arr) return type.INT; // 数组数据按 int32 对齐
      if(sym.Type>=type.PTR) return sym.Type-type.PTR;
    }
    if(node.kind==='AddressOf') return type.INT;
    if(node.kind==='StringLiteral') return type.CHAR;
    if(node.kind==='BinaryOp'&&(node.opToken===tokens.Add||node.opToken===tokens.Sub)){
      return this._ptrElemType(node.left)||this._ptrElemType(node.right);
    }
    return null;
  }

  // 如果是指针算术(p+n / n+p / p-n / p-q), 返回元素大小, 否则返回1;

  _ptrArithScale(node) {
    if(node.opToken!==tokens.Add&&node.opToken!==tokens.Sub) return 1;
    if(!this._isPtrNode(node.left)&&!this._isPtrNode(node.right)) return 1;
    const bt=this._ptrElemType(node.left)||this._ptrElemType(node.right)||type.INT;
    return this.typeSize(bt);
  }

  // 判断指针算术中, 哪个操作数是指针, 哪个是标量
  // 返回: 'leftPtr' / 'rightPtr' / 'bothPtr' / null;

  _ptrArithKind(node) {
    const l=this._isPtrNode(node.left), r=this._isPtrNode(node.right);
    if(l&&r) return 'bothPtr';
    if(l) return 'leftPtr';
    if(r) return 'rightPtr';
    return null;
  }

  // 指针 ++/--: 返回元素缩放大小 (非指针返回1);

  _ptrIncScale(node) {
    const bt=this._ptrElemType(node);
    return bt!==null?this.typeSize(bt):1;
  }

  // 从 Subscript 节点的基表达式推导元素大小;

  _subscrElemSize(node) {
    let baseType=type.INT;
    if(node.base.kind==='Identifier'){
      const sym=this.sysboltable[node.base.symIdx];
      if(sym){
        if(sym.Arr){
          // 数组: 检查元素类型是否为 struct
          const rawType=sym.Type>=type.PTR?sym.Type-type.PTR:sym.Type;
          if(rawType>=type.STRUCT&&rawType-type.STRUCT<this.structDefs.length)
            return this.structDefs[rawType-type.STRUCT].size;
        }else if(sym.Type>=type.PTR){
          baseType=sym.Type-type.PTR;
        }
      }
    }
    return this.typeSize(baseType);
  }

  // 从 Subscript 节点的基表达式推导加载指令 (LOADB/LOADH/LOAD);

  _subscrLoadOp(node) {
    let baseType=type.INT;
    if(node.base.kind==='Identifier'){
      const sym=this.sysboltable[node.base.symIdx];
      if(sym){
        if(sym.Arr){
          return opcode.LOAD; // 统一 WORD 加载
        }else if(sym.Type>=type.PTR){
          baseType=sym.Type-type.PTR;
        }
      }
    }
    return this.loadOp(baseType);
  }

  // 内联 wrapper: 将源函数名替换为目标函数名;

  _inlineWrappers(node) {
    if(!node || typeof node!=='object') return;
    if(node.kind==='FunctionCall'){
      const sn=this.sysboltable[node.symIdx];
      const name=sn&&sn.Name?this.getstring(sn.Name):'';
      // 内联 writedata → spirw: 替换 symIdx (避免 CALL fixup 引用无效函数)
      if(name==='writedata' && node.args.length===1){
        node.name='spirw';
        for(let si=0;si<this.sysboltableIndex;si++){
          if(this.sysboltable[si].Token===tokens.Id&&this.getstring(this.sysboltable[si].Name)==='spirw'){
            node.symIdx=si; break;
          }
        }
      }
    }
    for(const k of Object.keys(node)){
      const v=node[k];
      if(Array.isArray(v)){ for(const e of v) this._inlineWrappers(e); }
      else if(typeof v==='object'&&v!==null) this._inlineWrappers(v);
    }
  }

  // 检查 AST 子树是否引用了指定符号;

  _astUsesSym(node, symIdx) {
    if(!node||typeof node!=='object') return false;
    if(node.kind==='Identifier' && node.symIdx===symIdx) return true;
    for(const k of Object.keys(node)){
      if(k==='sym') continue;
      const v=node[k];
      if(v===node) continue; // 跳过循环引用
      if(Array.isArray(v)){for(const e of v) if(this._astUsesSym(e,symIdx)) return true;}
      else if(typeof v==='object'&&v!==null) if(this._astUsesSym(v,symIdx)) return true;
    }
    return false;
  }

  // 检测 count-down 循环模式: for(i=0;i<C;i++) → {limit:C, init:AssignNode};

  genFunc(funcDecl, isWeak, isInterrupt) {
    const sym = this.sysboltable[funcDecl.symIdx];
    // 重复定义 / weak 覆盖语义:
    //   - 已存在"非弱"定义: 不论本次是否 weak, 一律保留首次定义 (弱不能覆盖非弱)
    //   - 已存在"弱"定义, 本次为非弱: 覆盖重定义 (更新 FuncId)
    //   - 已存在"弱"定义, 本次也为弱: 保留首次弱定义
    if (sym.Class === tokens.Fun && sym.FuncId >= 0 && !(sym.Weak && !isWeak)) {
      return;
    }
    sym.Class = tokens.Fun;
    sym.Weak = isWeak ? 1 : 0;
    // 中断向量映射: 标记了 __interrupt_N 的函数, 记录到后端向量回填表 (index -> 函数名).
    // 弱覆盖: 即使后续同名非弱定义未再带 __interrupt_N, 该记录仍保留 (符号复用, 指向最终实现).
    if (isInterrupt !== undefined && isInterrupt >= 0) {
      sym.Interrupt = isInterrupt;
      if (!this.backend._interruptSlots) this.backend._interruptSlots = {};
      this.backend._interruptSlots[isInterrupt] = funcDecl.name;
    }
    this.backend.beginFunc();
    sym.Val = this.backend.here();
    this._calleeMask = 0; // 重置跨函数累积的问题

    let i = 0;
    // 参数: 前4进寄存器
    for(let p = 0; p < funcDecl.params.length; p++){
      const param = funcDecl.params[p];
      const psym = this.sysboltable[param.symIdx];
      psym.Class = tokens.Loc; psym.Type = param.type;
      psym.HClass = 0; psym.HType = 0; psym.HVal = 0;
      if(p < 4){
        psym.Val = -(p+1); psym.InReg = 1;
      } else {
        psym.Val = i; psym.InReg = 0; i++;
      }
    }
    this.loc = ++i;
    this.backend.setParamCount(funcDecl.params.length);

    // 尾调用 + 叶函数检测
    const stmts = funcDecl.body.stmts;
    const isTailCall = stmts.length === 1 && stmts[0].kind === 'ExprStmt'
        && stmts[0].expr.kind === 'FunctionCall';
    // 叶函数: 函数体内不含任何 CALL (不需保存 LR)
    const _hasCall = (node) => {
      if(!node||typeof node!=='object') return false;
      if(node.kind==='FunctionCall') return true;
      for(const k of Object.keys(node)){
        if(k==='sym') continue;
        const v=node[k];
        if(Array.isArray(v)){for(const e of v) if(_hasCall(e)) return true;}
        else if(typeof v==='object'&&v!==null) if(_hasCall(v)) return true;
      }
      return false;
    };
    const isLeaf = !_hasCall(funcDecl.body); // 叶函数: 不含 CALL, 后端可省 PUSH/POP LR
    this._isLeaf = isLeaf;

    if(isTailCall){
      // 尾调用函数: 依旧需要 ENTER/LEAVE 维护帧结构, 后端可酌情优化为 B func
    }
    this.emit(opcode.ENTER, 0);
      const enterPos = this.op;
      this._localVarIdx = this.loc; // 局部变量栈索引起始
      this._saveSlotsResv = false;  // 栈槽保存区预留标志 (见 _reserveSaveSlots)

      // 保存 InReg 参数 (R0-R3) 到 callee-saved 寄存器 (R4-R7)
      // 解决参数寄存器被后续 genExpr 覆盖导致参数值丢失的问题
      for(let p = 0; p < funcDecl.params.length && p < 4; p++){
        const psym = this.sysboltable[funcDecl.params[p].symIdx];
        if(psym.InReg && psym.Val < 0){
          const srcReg = (-psym.Val) - 1;  // R0, R1, R2, or R3
          const calleeReg = this.allocCalleeReg();
          if(calleeReg >= 0){
            this.emit(opcode.MOV, calleeReg, srcReg);
            psym.Val = -(calleeReg + 1);  // 指向 callee-saved 寄存器
            // InReg stays 1
          }
        }
      }

      for(const stmt of stmts){
        this.genStmt(stmt);
      }
      const leafBit = isLeaf ? (1<<16) : 0;
      this.patch(enterPos*4, (this._localVarIdx - this.loc) | (this._calleeMask<<8) | leafBit);
      // LEAVE 的 calleeMask 也编码 leaf 标志 (bit8)
      this.emit(opcode.LEAVE, this._calleeMask | (isLeaf ? 0x100 : 0));
    const funcId = this.backend.endFunc(funcDecl.name);
    sym.FuncId = funcId;
  }
  // ---- AST 模式 Comper ----;
}
// ---- 平台 I/O 适配层 (解耦 fs, 方便移植到浏览器/裸机) ----
// 移植时只需替换 kc_reg.io 这一处, 实现 open/read/close 三个语义即可.
kc_reg.io = (function(){
  let fsMod = null;
  try { fsMod = require('fs'); } catch(e) { fsMod = null; } // 浏览器/无 fs 环境下为 null
  if(!fsMod){
    // 默认 stub: 不支持文件 I/O 的平台返回失败, 由宿主自行覆盖 kc_reg.io
    return { open:()=>-1, read:()=>-1, close:()=>0 };
  }
  return {
    open:(path)=>fsMod.openSync(path,'r'),
    // 读入 nb 字节, 返回 Uint8Array (Buffer 是 Uint8Array 子类, 天然满足). 浏览器版自行返回 Uint8Array.
    read:(fd,nb)=>{const buf=Buffer.alloc(nb);const br=fsMod.readSync(fd,buf,0,nb,0);return buf.subarray(0,br);},
    close:(fd)=>{fsMod.closeSync(fd);return 0;}
  };
})();

kc_reg.defaultSysFuncs={
  open:(ctx,sp)=>{try{return kc_reg.io.open(ctx.getstring(ctx.Intdata[(sp>>2)+1]));}catch(e){return -1;}},
  read:(ctx,sp)=>{const fd=ctx.Intdata[(sp>>2)+2],nb=ctx.Intdata[sp>>2],dst=ctx.Intdata[(sp>>2)+1];try{const buf=kc_reg.io.read(fd,nb);for(let i=0;i<buf.length;i++)ctx.rwdata[dst+i]=buf[i];return buf.length;}catch(e){return -1;}},
  close:(ctx,sp)=>{try{return kc_reg.io.close(ctx.Intdata[sp>>2]);}catch(e){return -1;}},
  printf:(ctx,sp,ac)=>{const r=ctx.printf(ctx.Intdata[(sp>>2)+ac-1],ctx.Intdata[(sp>>2)+ac-2],ctx.Intdata[(sp>>2)+ac-3],ctx.Intdata[(sp>>2)+ac-4]);ctx.output+=r;console.log(r);return 0;},
  malloc:(ctx,sp)=>{const r=ctx.datapos;ctx.datapos+=ctx.Intdata[sp>>2];ctx.datapos=(ctx.datapos+ctx.intsizeof)&(-ctx.intsizeof);return r;},
  free:()=>0,
  memset:(ctx,sp)=>{const d1=ctx.Intdata[(sp>>2)+2],v1=ctx.Intdata[(sp>>2)+1]&0xFF,c1=ctx.Intdata[sp>>2];for(let i=0;i<c1;i++)ctx.rwdata[d1+i]=v1;return 0;},
  memcmp:(ctx,sp)=>{const s1=ctx.Intdata[(sp>>2)+2],s2=ctx.Intdata[(sp>>2)+1],ln=ctx.Intdata[sp>>2];let df=0;for(let i=0;i<ln;i++){if(ctx.rwdata[s1+i]!==ctx.rwdata[s2+i]){df=1;break;}}return df;},
  memcpy:(ctx,sp)=>{const dst=ctx.Intdata[(sp>>2)+2],src=ctx.Intdata[(sp>>2)+1],n=ctx.Intdata[sp>>2];for(let i=0;i<n;i++)ctx.rwdata[dst+i]=ctx.rwdata[src+i];return 0;},
  exit:(ctx,sp)=>{const msg=`exit(${ctx.Intdata[sp>>2]})\r\n`;ctx.output+=msg;console.log(msg);ctx._exitFlag=true;return 0;}
};

// UMD 导出：Node 用 module.exports，浏览器挂到 window.C4Reg
if (_c4RegIsNode) {
  module.exports = { kc_reg, RegBackend, opcode, tokens };
} else if (typeof window !== 'undefined') {
  window.C4Reg = { kc_reg, RegBackend, opcode, tokens };
} else if (typeof define === 'function' && define.amd) {
  define(() => ({ kc_reg, RegBackend, opcode, tokens }));
}
})();
