/**
 * _test_vm_m0.js — 使用 M0 VM (ThumbBackend + ThumbCPU) 测试全部 C 语法
 *
 * 所有结果通过 printf 输出到 kc.output 进行验证。
 *
 * 使用单文件整合后端:
 *   - ./c4_reg.js       编译器核 + RegBackend VM (kc_reg)
 *   - ./thumb_backend.js 导出 ThumbBackend (内部 require('./c4_reg.js') 复用编译器核)
 */
'use strict';

const c4 = require('./c4_reg.js');
const {ThumbBackend} = require('./thumb_backend.js');

let passed = 0;
let failed = 0;
const failures = [];

function compileAndRun(code) {
  // printf 系统调用: 从 c.Intdata (由 SWI handler 填充) 读取格式化参数
  const sys = { printf: (c, sp, ac) => {
    const addr = c.Intdata[sp>>2];
    let s = '';
    for (let i = addr; c.data[i]; i++) s += String.fromCharCode(c.data[i]);
    let result = '', ai = 1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '%' && i+1 < s.length) {
        i++;
        if (s[i] === 'd') { result += c.Intdata[(sp>>2)+ai].toString(); ai++; }
        else if (s[i] === 's') { result += s; }
        else if (s[i] === '%') result += '%';
        else result += '%' + s[i];
      } else {
        result += s[i];
      }
    }
    c.output += result;
    return 0;
  }};
  const _opt = process.argv[2] !== undefined ? parseInt(process.argv[2]) : 0;
  const backend = new ThumbBackend(_opt);
  const kc = new c4.kc_reg(_opt, backend);
  kc.output = '';
  const mainAddr = kc.Comper(code, 1, sys);
  const ow = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => {};
  try { backend.run(mainAddr, [], kc); } finally { process.stdout.write = ow; }
  return kc;
}

function assert(label, kc, expected) {
  const out = kc.output.replace(/exit.*/,'').trim();
  if (out.indexOf(expected) >= 0) {
    passed++; console.log(`  ✓ ${label}: ${JSON.stringify(out)}`);
  } else {
    failed++; const msg = `  ✗ ${label}: expected "${expected}", got ${JSON.stringify(out)}`;
    console.log(msg); failures.push(msg);
  }
}

console.log('\n=== T1: 算术运算 (+, -, *, /, %) ===');
assert('add', compileAndRun('int main(){printf("%d",10+20);return 0;}'), '30');
assert('sub', compileAndRun('int main(){printf("%d",50-8);return 0;}'), '42');
assert('mul', compileAndRun('int main(){printf("%d",7*6);return 0;}'), '42');
assert('div', compileAndRun('int main(){printf("%d",100/3);return 0;}'), '33');
assert('mod', compileAndRun('int main(){printf("%d",17%5);return 0;}'), '2');

console.log('\n=== T2: 比较运算符 ===');
assert('eq', compileAndRun('int main(){printf("%d",10==10);return 0;}'), '1');
assert('ne', compileAndRun('int main(){printf("%d",10!=20);return 0;}'), '1');
assert('lt', compileAndRun('int main(){printf("%d",10<20);return 0;}'), '1');
assert('gt', compileAndRun('int main(){printf("%d",10>20);return 0;}'), '0');
assert('le', compileAndRun('int main(){printf("%d",10<=10);return 0;}'), '1');
assert('ge', compileAndRun('int main(){printf("%d",10>=11);return 0;}'), '0');

console.log('\n=== T3: 位运算 ===');
assert('&', compileAndRun('int r;int main(){r=0x0F&0x33;printf("%d",r);return 0;}'), '3');
assert('|', compileAndRun('int r;int main(){r=0x0F|0x30;printf("%d",r);return 0;}'), '63');
assert('^', compileAndRun('int r;int main(){r=0xFF^0x0F;printf("%d",r);return 0;}'), '240');
assert('<<', compileAndRun('int r;int main(){r=1<<3;printf("%d",r);return 0;}'), '8');
assert('>>', compileAndRun('int r;int main(){r=0x80>>2;printf("%d",r);return 0;}'), '32');

console.log('\n=== T4: 逻辑运算 ===');
assert('&&', compileAndRun('int r;int main(){r=1&&0;printf("%d",r);return 0;}'), '0');
assert('||', compileAndRun('int r;int main(){r=1||0;printf("%d",r);return 0;}'), '1');
assert('!0', compileAndRun('int r;int main(){r=!0;printf("%d",r);return 0;}'), '1');
assert('!1', compileAndRun('int r;int main(){r=!1;printf("%d",r);return 0;}'), '0');

console.log('\n=== T5: 条件运算符 ===');
assert('?: true', compileAndRun('int r;int main(){r=1?100:200;printf("%d",r);return 0;}'), '100');
assert('?: false', compileAndRun('int r;int main(){r=0?100:200;printf("%d",r);return 0;}'), '200');

console.log('\n=== T6: if-else ===');
assert('if(1)', compileAndRun('int r;int main(){int x=1;if(x)r=10;else r=20;printf("%d",r);return 0;}'), '10');
assert('if(0)', compileAndRun('int r;int main(){int x=0;if(x)r=10;else r=20;printf("%d",r);return 0;}'), '20');
assert('if-else chain', compileAndRun('int r;int main(){int x=5;if(x>10)r=1;else if(x>3)r=2;else r=3;printf("%d",r);return 0;}'), '2');

console.log('\n=== T7: for 循环 ===');
assert('for sum', compileAndRun('int r;int main(){int s=0,i;for(i=0;i<5;i++)s=s+i;r=s;printf("%d",r);return 0;}'), '10');
assert('for count-down', compileAndRun('int r;int main(){int i;for(i=3;i>0;i--){}r=i;printf("%d",r);return 0;}'), '0');

console.log('\n=== T8: while 循环 ===');
assert('while', compileAndRun('int r;int main(){int x=3;while(x>0)x=x-1;r=x;printf("%d",r);return 0;}'), '0');

console.log('\n=== T9: do-while 循环 ===');
assert('do-while', compileAndRun('int r;int main(){int x=0;do{x=x+1;}while(x<3);r=x;printf("%d",r);return 0;}'), '3');

console.log('\n=== T10: switch-case ===');
assert('case 2', compileAndRun('int r;int main(){int x=2;r=0;switch(x){case 1:r=10;break;case 2:r=20;break;case 3:r=30;break;default:r=99;}printf("%d",r);return 0;}'), '20');
assert('default', compileAndRun('int r;int main(){int x=5;switch(x){case 1:r=10;break;case 2:r=20;break;default:r=99;}printf("%d",r);return 0;}'), '99');

console.log('\n=== T11: 函数调用 ===');
assert('add', compileAndRun('int add(int a,int b){return a+b;}int r;int main(){r=add(3,4);printf("%d",r);return 0;}'), '7');

console.log('\n=== T12: 嵌套函数调用 ===');
assert('nested', compileAndRun('int sq(int x){return x*x;}int r;int main(){r=sq(sq(3));printf("%d",r);return 0;}'), '81');

console.log('\n=== T13: 递归 ===');
assert('fact(5)', compileAndRun('int fact(int n){if(n<=1)return 1;return n*fact(n-1);}int r;int main(){r=fact(5);printf("%d",r);return 0;}'), '120');

console.log('\n=== T14: break ===');
assert('break', compileAndRun('int r;int main(){int i;for(i=0;i<10;i++){if(i==3)break;}r=i;printf("%d",r);return 0;}'), '3');

console.log('\n=== T15: continue ===');
assert('continue', compileAndRun('int r;int main(){int s=0,i;for(i=0;i<5;i++){if(i==2)continue;s=s+i;}r=s;printf("%d",r);return 0;}'), '8');

console.log('\n=== T16: 前缀/后缀 ++/-- ===');
assert('pre++', compileAndRun('int r;int main(){int x=5;r=++x;printf("%d",r);return 0;}'), '6');
assert('post++', compileAndRun('int r;int main(){int x=5;r=x++;printf("%d",r);return 0;}'), '5');
assert('pre--', compileAndRun('int r;int main(){int x=5;r=--x;printf("%d",r);return 0;}'), '4');
assert('post--', compileAndRun('int r;int main(){int x=5;r=x--;printf("%d",r);return 0;}'), '5');

console.log('\n=== T17: 复合赋值 ===');
assert('+=', compileAndRun('int r;int main(){int x=10;x+=5;r=x;printf("%d",r);return 0;}'), '15');
assert('-=', compileAndRun('int r;int main(){int x=10;x-=3;r=x;printf("%d",r);return 0;}'), '7');
assert('*=', compileAndRun('int r;int main(){int x=10;x*=2;r=x;printf("%d",r);return 0;}'), '20');
assert('/=', compileAndRun('int r;int main(){int x=10;x/=3;r=x;printf("%d",r);return 0;}'), '3');
assert('%=', compileAndRun('int r;int main(){int x=10;x%=4;r=x;printf("%d",r);return 0;}'), '2');

console.log('\n=== T18: 指针 ===');
assert('ptr deref', compileAndRun('int r;int main(){int x=42;int*p=&x;r=*p;printf("%d",r);return 0;}'), '42');
assert('ptr assign', compileAndRun('int r;int main(){int x=10;int*p=&x;*p=99;r=x;printf("%d",r);return 0;}'), '99');

console.log('\n=== T19: 全局变量 ===');
assert('global read', compileAndRun('int g=123;int r;int main(){r=g;printf("%d",r);return 0;}'), '123');
assert('global write', compileAndRun('int g;int main(){g=456;printf("%d",g);return 0;}'), '456');

console.log('\n=== T20: 全局数组 ===');
assert('array index', compileAndRun('int a[3]={10,20,30};int r;int main(){r=a[1];printf("%d",r);return 0;}'), '20');
assert('array write', compileAndRun('int a[3]={10,20,30};int r;int main(){a[1]=99;r=a[1];printf("%d",r);return 0;}'), '99');

console.log('\n=== T21: sizeof ===');
assert('sizeof int', compileAndRun('int r;int main(){r=sizeof(int);printf("%d",r);return 0;}'), '4');
assert('sizeof char', compileAndRun('int r;int main(){r=sizeof(char);printf("%d",r);return 0;}'), '1');
assert('sizeof short', compileAndRun('int r;int main(){r=sizeof(short);printf("%d",r);return 0;}'), '2');

console.log('\n=== T22: char 类型 ===');
assert('char array', compileAndRun('char a[3]={0x10,0x20,0x30};int r;int main(){r=a[1];printf("%d",r);return 0;}'), '32');

console.log('\n=== T23: short 类型 ===');
assert('short array', compileAndRun('short a[3]={100,200,300};int r;int main(){r=a[1];printf("%d",r);return 0;}'), '200');

console.log('\n=== T24: const 关键字 ===');
assert('const', compileAndRun('const int cv=777;int r;int main(){r=cv;printf("%d",r);return 0;}'), '777');

console.log('\n=== T25: 字符串字面量 ===');
assert('string literal', compileAndRun('int main(){printf("Hello");return 0;}'), 'Hello');

console.log('\n=== T26: 多参数函数 (>4) ===');
assert('5 args', compileAndRun('int s5(int a,int b,int c,int d,int e){return a+b+c+d+e;}int r;int main(){r=s5(1,2,3,4,5);printf("%d",r);return 0;}'), '15');

console.log('\n=== T27: 指针运算 ===');
assert('ptr+2', compileAndRun('int a[4]={10,20,30,40};int r;int main(){int*p=a;r=*(p+2);printf("%d",r);return 0;}'), '30');

console.log('\n=== T28: 链式赋值 ===');
assert('chain assign', compileAndRun('int main(){int x,y;x=y=99;printf("%d%d",x,y);return 0;}'), '9999');

console.log('\n=== T29: enum ===');
assert('enum', compileAndRun('int r;enum{A,B,C};int main(){r=B;printf("%d",r);return 0;}'), '1');
assert('enum val', compileAndRun('int r;enum{RED=10,GREEN=20,BLUE=30};int main(){r=GREEN;printf("%d",r);return 0;}'), '20');

console.log('\n=== T30: void 函数 ===');
assert('void func', compileAndRun('int r;void set(int v){r=v;}int main(){set(55);printf("%d",r);return 0;}'), '55');

console.log('\n=== T31: 字符串指针 ===');
assert('char*', compileAndRun('int r;int main(){char*s="abc";r=s[1];printf("%d",r);return 0;}'), '98');

console.log('\n=== T32: 复杂表达式 ===');
assert('complex expr', compileAndRun('int r;int main(){r=(2+3)*(10-4)/5;printf("%d",r);return 0;}'), '6');

console.log('\n=== T33: 嵌套循环 ===');
assert('nested loop', compileAndRun('int r;int main(){int i,j,s=0;for(i=0;i<3;i++){j=0;while(j<2){s=s+1;j++;}}r=s;printf("%d",r);return 0;}'), '6');

console.log('\n=== T34: cast 表达式 ===');
assert('cast', compileAndRun('int r;int main(){r=(char)0xABCD;printf("%d",r);return 0;}'), '205');

console.log('\n=== T35: 全局指针 ===');
assert('global ptr', compileAndRun('int t;int*p=&t;int main(){*p=42;printf("%d",t);return 0;}'), '42');

console.log('\n=== T36: 逗号与多表达式函数 ===');
assert('multi expr', compileAndRun('int r;int main(){int x;x=10;x=x+5;r=x;printf("%d",r);return 0;}'), '15');

console.log('\n=== T37: 更多指针算术 (ptr-1, ptr diff) ===');
assert('ptr-1', compileAndRun('int a[4]={10,20,30,40};int r;int main(){int*p=a+3;r=*(p-1);printf("%d",r);return 0;}'), '30');
assert('ptr diff', compileAndRun('int a[4]={10,20,30,40};int r;int main(){int*p=a+3,*q=a;r=p-q;printf("%d",r);return 0;}'), '3');

console.log('\n=== T38: 嵌套指针算术 ===');
assert('nested ptr', compileAndRun('int a[4]={10,20,30,40};int r;int main(){int*p=a+1;r=*(p+1+1);printf("%d",r);return 0;}'), '40');

console.log('\n=== T39: char* 指针算术 ===');
assert('char ptr+1', compileAndRun('char s[4]={97,98,99,0};int r;int main(){r=*(s+1);printf("%d",r);return 0;}'), '98');

console.log('\n=== T40: 短整型数组下标 ===');
assert('short subscr 0', compileAndRun('short a[3]={100,200,300};int r;int main(){r=a[0];printf("%d",r);return 0;}'), '100');
assert('short subscr 2', compileAndRun('short a[3]={100,200,300};int r;int main(){r=a[2];printf("%d",r);return 0;}'), '300');
assert('write short subscr', compileAndRun('short a[3]={100,200,300};int r;int main(){a[2]=999;r=a[2];printf("%d",r);return 0;}'), '999');

console.log('\n=== T41: 多种类型转换 ===');
assert('cast char trunc', compileAndRun('int r;int main(){r=(char)0xABCDEF;printf("%d",r);return 0;}'), '239');
assert('cast short trunc', compileAndRun('int r;int main(){r=(short)0x12345678;printf("%d",r);return 0;}'), '22136');

console.log('\n=== T42: 二级指针 ===');
assert('ptr to ptr', compileAndRun('int r;int x=42;int*p=&x;int**pp=&p;int main(){r=**pp;printf("%d",r);return 0;}'), '42');

console.log('\n=== T43: 复杂组合表达式 ===');
assert('combo 1', compileAndRun('int r;int main(){int a[3]={5,10,15};int*p=a;r=*(p+1)+*(p+2);printf("%d",r);return 0;}'), '25');

console.log('\n=== T44: 指针自增 ===');
assert('ptr++', compileAndRun('int a[3]={10,20,30};int r;int main(){int*p=a;int x=*p;p++;int y=*p;r=x+y;printf("%d",r);return 0;}'), '30');
assert('++ptr', compileAndRun('int a[3]={10,20,30};int r;int main(){int*p=a;++p;r=*p;printf("%d",r);return 0;}'), '20');
assert('ptr--', compileAndRun('int a[3]={10,20,30};int r;int main(){int*p=a+2;p--;r=*p;printf("%d",r);return 0;}'), '20');

console.log('\n=== T45: &* 和 *& ===');
assert('&*p', compileAndRun('int x=42;int r;int main(){int*p=&x;int*q=&*p;r=(p==q?1:0);printf("%d",r);return 0;}'), '1');
assert('*&x', compileAndRun('int x=42;int r;int main(){r=*&x;printf("%d",r);return 0;}'), '42');

console.log('\n=== T46: 指针比较 ===');
assert('ptr eq', compileAndRun('int a[3];int r;int main(){int*p=a;int*q=a;r=(p==q?1:0);printf("%d",r);return 0;}'), '1');
assert('ptr ne', compileAndRun('int a[3];int r;int main(){int*p=a;int*q=a+1;r=(p!=q?1:0);printf("%d",r);return 0;}'), '1');
assert('ptr lt', compileAndRun('int a[3];int r;int main(){int*p=a;int*q=a+1;r=(p<q?1:0);printf("%d",r);return 0;}'), '1');

console.log('\n=== T47: do-while + break/continue ===');
assert('do break', compileAndRun('int r;int main(){int i=0,s=0;do{i++;if(i==3)break;s=s+i;}while(i<5);r=s;printf("%d",r);return 0;}'), '3');
assert('do continue', compileAndRun('int r;int main(){int i=0,s=0;do{i++;if(i==3)continue;s=s+i;}while(i<4);r=s;printf("%d",r);return 0;}'), '7');

console.log('\n=== T48: while + break/continue ===');
assert('while break', compileAndRun('int r;int main(){int i=0,s=0;while(i<5){i++;if(i==3)break;s=s+i;}r=s;printf("%d",r);return 0;}'), '3');
assert('while continue', compileAndRun('int r;int main(){int i=0,s=0;while(i<5){i++;if(i==3)continue;s=s+i;}r=s;printf("%d",r);return 0;}'), '12');

console.log('\n=== T49: 嵌套 for + break ===');
assert('nested break', compileAndRun('int r;int main(){int s=0,i,j;for(i=0;i<3;i++){for(j=0;j<3;j++){s++;if(i==1&&j==1)break;}if(i==1)break;}r=s;printf("%d",r);return 0;}'), '5');

console.log('\n=== T50: 多层嵌套表达式 ===');
assert('deep parens', compileAndRun('int r;int main(){int x=1,y=2,z=3;r=(((x+y)*z)-1)/2;printf("%d",r);return 0;}'), '4');
assert('mixed arith', compileAndRun('int r;int main(){r=10+20*3-5/2;printf("%d",r);return 0;}'), '68');

console.log('\n=== T51: struct 基本操作 ===');
assert('struct read', compileAndRun('struct P{int x;int y;};int r;int main(){struct P pt;pt.x=10;pt.y=20;r=pt.x+pt.y;printf("%d",r);return 0;}'), '30');
assert('struct write', compileAndRun('struct P{int x;int y;};int r;int main(){struct P pt;pt.x=7;pt.y=8;r=pt.x*pt.y;printf("%d",r);return 0;}'), '56');

console.log('\n=== T52: struct 指针 (->) ===');
assert('ptr -> member', compileAndRun('struct P{int x;int y;};int r;int main(){struct P pt;struct P*p=&pt;p->x=100;p->y=200;r=p->x+p->y;printf("%d",r);return 0;}'), '300');

console.log('\n=== T53: 全局 struct ===');
assert('global struct', compileAndRun('struct P{int x;int y;};struct P gp;int main(){gp.x=5;gp.y=6;printf("%d",gp.x+gp.y);return 0;}'), '11');

console.log('\n=== T54: char/short struct 成员 ===');
assert('char member', compileAndRun('struct S{char a;int b;};int r;int main(){struct S s;s.a=65;s.b=100;r=s.a;printf("%d",r);return 0;}'), '65');
assert('short member', compileAndRun('struct S{short a;int b;};int r;int main(){struct S s;s.a=200;s.b=300;r=s.a+s.b;printf("%d",r);return 0;}'), '500');

console.log('\n=== T55: union ===');
assert('union int', compileAndRun('union U{int x;int y;};int r;int main(){union U u;u.x=42;r=u.y;printf("%d",r);return 0;}'), '42');

console.log('\n=== T56: struct 指针算术 ===');
assert('struct ptr+1', compileAndRun('struct P{int x;int y;};int g[4];int r;int main(){struct P*p=(struct P*)g;p->x=10;p->y=20;struct P*q=p+1;q->x=30;q->y=40;r=*(g+2)+*(g+3);printf("%d",r);return 0;}'), '70');

console.log('\n=== T57: 嵌套 struct ===');
assert('nested struct', compileAndRun('struct Inner{int a;int b;};struct Outer{struct Inner in;int c;};int r;int main(){struct Outer o;o.in.a=1;o.in.b=2;o.c=3;r=o.in.a+o.in.b+o.c;printf("%d",r);return 0;}'), '6');

console.log('\n=== T58: struct 成员对齐 ===');
assert('align int+char+int', compileAndRun('struct S{int a;char c;int b;};int r;int main(){struct S s;s.a=10;s.c=65;s.b=20;r=s.a+s.b;printf("%d",r);return 0;}'), '30');
assert('align char+int', compileAndRun('struct S{char c;int x;};int r;int main(){struct S s;s.c=99;s.x=42;r=s.c;printf("%d",r);return 0;}'), '99');

console.log('\n=== T59: 多 struct 类型 ===');
assert('multi struct', compileAndRun('struct A{int x;};struct B{int y;};int r;int main(){struct A a;a.x=5;struct B b;b.y=10;r=a.x+b.y;printf("%d",r);return 0;}'), '15');

console.log('\n=== T60: struct 指针成员 ===');
assert('ptr member', compileAndRun('struct S{int x;int*y;};int t=42;int r;int main(){struct S s;s.x=10;s.y=&t;r=*s.y;printf("%d",r);return 0;}'), '42');

console.log('\n=== T61: 嵌套 struct 指针 ===');
assert('nested ptr chain', compileAndRun('struct A{int x;};struct B{struct A a;int y;};int r;int main(){struct B b;b.a.x=7;b.y=8;struct B*p=&b;r=p->a.x+p->y;printf("%d",r);return 0;}'), '15');

console.log('\n=== T62: 联合不同大小成员 ===');
assert('union char vs int', compileAndRun('union U{char c;int x;};int r;int main(){union U u;u.x=0x12345678;r=(unsigned char)u.c;printf("%d",r);return 0;}'), '120');
assert('union multiple writes', compileAndRun('union U{int x;int y;int z;};int r;int main(){union U u;u.x=10;u.y=20;u.z=30;r=u.x+u.y+u.z;printf("%d",r);return 0;}'), '90');

console.log('\n=== T63: struct 赋值与运算 ===');
assert('struct mul', compileAndRun('struct P{int x;int y;};int r;int main(){struct P pt;pt.x=3;pt.y=4;r=pt.x*pt.x+pt.y*pt.y;printf("%d",r);return 0;}'), '25');
assert('struct complex', compileAndRun('struct P{int a;int b;};int r;int main(){struct P p;p.a=10;p.b=20;r=(p.a+p.b)*(p.b-p.a)/10;printf("%d",r);return 0;}'), '30');

console.log('\n=== T64: 多重嵌套 struct ===');
assert('double nested', compileAndRun('struct A{int x;};struct B{struct A a;int y;};struct C{struct B b;int z;};int r;int main(){struct C c;c.b.a.x=1;c.b.y=2;c.z=3;r=c.b.a.x+c.b.y+c.z;printf("%d",r);return 0;}'), '6');

console.log('\n=== T65: struct x->member 不同字段 ===');
assert('multi field', compileAndRun('struct P{int a;int b;int c;};int r;int main(){struct P s;s.a=1;s.b=2;s.c=3;r=s.a*100+s.b*10+s.c;printf("%d",r);return 0;}'), '123');

console.log('\n=== T66: struct 指针比较 ===');
assert('ptr eq', compileAndRun('struct P{int x;int y;};int r;int main(){struct P a,b;struct P*p=&a,*q=&a;r=(p==q?1:0);printf("%d",r);return 0;}'), '1');
assert('ptr ne', compileAndRun('struct P{int x;int y;};int r;int main(){struct P a,b;struct P*p=&a,*q=&b;r=(p!=q?1:0);printf("%d",r);return 0;}'), '1');

console.log('\n=== T67: struct 指针算术偏移 ===');
assert('struct ptr offset', compileAndRun('struct P{int x;int y;};int buf[6];int r;int main(){struct P*base=(struct P*)buf;base->x=5;base->y=10;(base+1)->x=base->x+base->y;r=(base+1)->x;printf("%d",r);return 0;}'), '15');

console.log('\n=== T68: 大 struct (多成员) ===');
assert('big struct', compileAndRun('struct Big{int a;int b;int c;int d;int e;};int r;int main(){struct Big bg;bg.a=1;bg.b=2;bg.c=3;bg.d=4;bg.e=5;r=bg.a+bg.b+bg.c+bg.d+bg.e;printf("%d",r);return 0;}'), '15');

console.log('\n=== T69: struct 与指针混合成员 ===');
assert('mixed members', compileAndRun('struct S{int x;int*ptr;int y;};int val=99;int r;int main(){struct S s;s.x=10;s.ptr=&val;s.y=20;r=s.x+*s.ptr+s.y;printf("%d",r);return 0;}'), '129');

console.log('\n=== T70: 全局 union 变量 ===');
assert('global union int', compileAndRun('union U{int a;int b;};union U gu;int main(){gu.a=77;printf("%d",gu.b);return 0;}'), '77');
assert('global union overwrite', compileAndRun('union U{int x;int y;};union U gu;int main(){gu.x=100;gu.y=200;printf("%d",gu.x);return 0;}'), '200');

console.log('\n=== T71: 函数指针基本调用 ===');
assert('func ptr call', compileAndRun('int dummy(int x){return x*7+1;}int add(int a,int b){return a+b;}int r;int main(){int(*fp)(int,int);fp=add;r=fp(3,4);printf("%d",r);return 0;}'), '7');
assert('func ptr with &', compileAndRun('int dummy(int x){return x*7+1;}int add(int a,int b){return a+b;}int r;int main(){int(*fp)(int,int);fp=&add;r=fp(10,20);printf("%d",r);return 0;}'), '30');
assert('func ptr decl-init', compileAndRun('int dummy(int x){return x*2;}int add(int a,int b){return a+b;}int r;int main(){int(*fp)(int,int)=add;r=fp(3,4);printf("%d",r);return 0;}'), '7');

console.log('\n=== T72: 函数指针多参数 ===');
assert('func ptr 5 args', compileAndRun('int sum5(int a,int b,int c,int d,int e){return a+b+c+d+e;}int r;int main(){int(*fp)(int,int,int,int,int);fp=sum5;r=fp(1,2,3,4,5);printf("%d",r);return 0;}'), '15');

console.log('\n=== T73: 函数指针通过 (*fp)(args) 调用 ===');
assert('deref call', compileAndRun('int mul(int a,int b){return a*b;}int r;int main(){int(*fp)(int,int);fp=mul;r=(*fp)(6,7);printf("%d",r);return 0;}'), '42');

console.log('\n=== T74: 函数指针重新赋值 ===');
assert('reassign func ptr', compileAndRun('int add(int a,int b){return a+b;}int sub(int a,int b){return a-b;}int r;int main(){int(*fp)(int,int);fp=add;fp=sub;r=fp(10,3);printf("%d",r);return 0;}'), '7');

console.log('\n=== T75: 函数指针作为返回值 ===');
assert('func ptr return', compileAndRun('int add(int a,int b){return a+b;}int r;int main(){int(*fp)(int,int);fp=add;int(*fq)(int,int);fq=fp;r=fq(12,13);printf("%d",r);return 0;}'), '25');

console.log('\n=== T76: 多个函数指针 ===');
assert('multi func ptr', compileAndRun('int add3(int a,int b,int c){return a+b+c;}int r;int main(){int(*f1)(int,int,int);int(*f2)(int,int,int);f1=add3;f2=f1;r=f2(1,2,3);printf("%d",r);return 0;}'), '6');

console.log('\n=== T77: 递归函数指针 ===');
assert('recursive func ptr', compileAndRun('int fact(int n){if(n<=1)return 1;return n*fact(n-1);}int r;int main(){int(*fp)(int);fp=fact;r=fp(5);printf("%d",r);return 0;}'), '120');

console.log('\n=== T78: 函数指针嵌套调用 ===');
assert('nested func ptr', compileAndRun('int sq(int x){return x*x;}int r;int main(){int(*fp)(int);fp=sq;r=fp(fp(3));printf("%d",r);return 0;}'), '81');

console.log('\n=== T79: 条件选择函数指针 ===');
assert('cond func ptr', compileAndRun('int add(int a,int b){return a+b;}int sub(int a,int b){return a-b;}int r;int main(){int(*fp)(int,int);int x=1;if(x)fp=add;else fp=sub;r=fp(20,5);printf("%d",r);return 0;}'), '25');
assert('else branch', compileAndRun('int add(int a,int b){return a+b;}int sub(int a,int b){return a-b;}int r;int main(){int(*fp)(int,int);int x=0;if(x)fp=add;else fp=sub;r=fp(20,5);printf("%d",r);return 0;}'), '15');

console.log('\n=== T80: Power-of-2 除法 (有符号安全) ===');
assert('div4 pos', compileAndRun('int r;int main(){int x=7;r=x/4;printf("%d",r);return 0;}'), '1');
assert('div4 neg', compileAndRun('int r;int main(){int x=0-7;r=x/4;printf("%d",r);return 0;}'), '-1');
assert('div4 exact neg', compileAndRun('int r;int main(){int x=0-16;r=x/4;printf("%d",r);return 0;}'), '-4');
assert('div16', compileAndRun('int r;int main(){int x=100;r=x/16;printf("%d",r);return 0;}'), '6');
assert('div1', compileAndRun('int r;int main(){int x=42;r=x/1;printf("%d",r);return 0;}'), '42');
assert('div expr', compileAndRun('int r;int main(){r=(10+20)/4;printf("%d",r);return 0;}'), '7');
assert('div non-pow2', compileAndRun('int r;int main(){int x=10;r=x/3;printf("%d",r);return 0;}'), '3');

console.log('\n=== T81: Power-of-2 取模 (有符号安全) ===');
assert('mod4 pos', compileAndRun('int r;int main(){int x=7;r=x%4;printf("%d",r);return 0;}'), '3');
assert('mod4 neg', compileAndRun('int r;int main(){int x=0-7;r=x%4;printf("%d",r);return 0;}'), '-3');
assert('mod4 exact neg', compileAndRun('int r;int main(){int x=0-16;r=x%4;printf("%d",r);return 0;}'), '0');
assert('mod16', compileAndRun('int r;int main(){int x=100;r=x%16;printf("%d",r);return 0;}'), '4');
assert('mod1', compileAndRun('int r;int main(){int x=42;r=x%1;printf("%d",r);return 0;}'), '0');

console.log('\n=== T82: Power-of-2 复合赋值 ===');
assert('/=4 pos', compileAndRun('int r;int main(){int x=10;x/=4;r=x;printf("%d",r);return 0;}'), '2');
assert('/=4 neg', compileAndRun('int r;int main(){int x=0-7;x/=4;r=x;printf("%d",r);return 0;}'), '-1');
assert('%=4 pos', compileAndRun('int r;int main(){int x=10;x%=4;r=x;printf("%d",r);return 0;}'), '2');
assert('%=4 neg', compileAndRun('int r;int main(){int x=0-7;x%=4;r=x;printf("%d",r);return 0;}'), '-3');
assert('%=1', compileAndRun('int r;int main(){int x=42;x%=1;r=x;printf("%d",r);return 0;}'), '0');
assert('/=8 var', compileAndRun('int r;int main(){int x=100;x/=8;r=x;printf("%d",r);return 0;}'), '12');

console.log('\n=== T83: 叶函数检测 (不回归) ===');
assert('leaf mul', compileAndRun('int leaf(int x){return x*2;}int r;int main(){r=leaf(21);printf("%d",r);return 0;}'), '42');
assert('leaf chain', compileAndRun('int a(int x){return x+1;}int b(int x){return a(x)+1;}int r;int main(){r=b(5);printf("%d",r);return 0;}'), '7');
console.log('\n=== T84: 复杂多层循环 ===');
assert('mul call', compileAndRun(`
  int pa=0;
void spirw(char data){ pa++; }
void setaddress(int x,int y){
  spirw(0xb0+y);
  spirw(0x10+x/16);
  spirw(x%16);
}
void writedata(char data){ spirw(data); }
void clear(){
  int x,y;
  for(y=0;y<4;y++){
    setaddress(0,y);
    for(x=0;x<2;x++)
      writedata(0);
  }
}
int main(){ clear();clear();printf("%d",pa);return 0; }
  `), '40');
// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log('All tests passed!');
process.exit(0);
