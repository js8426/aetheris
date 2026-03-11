import { useEffect, useRef } from "react";
export default function AgentGas({ compact = false } = {}) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf, t = 0;
    const W=400,H=520,DIVIDER_Y=68,PANEL_Y=72,PANEL_H=58,CHAR_OFFSET=0,HEAD_KILL_Y=210;
    const AC="#22c55e",ACD="rgba(34,197,94,",CY="#06b6d4";
    const CHARS=["GAS","FREE","0x00","PAID","0xFE","BASE","GWEI","ETH","$0","FAST","0xFF","OKGO","0x1A","RELAY"];
    const dataStream=Array.from({length:40},()=>spawnP(true));
    const orbiters=Array.from({length:12},(_,i)=>({angle:(i/12)*Math.PI*2,r:112+(i%3)*14,speed:0.007+(i%4)*0.003,size:1.1+(i%3)*0.6,yMod:(i%5)*7-14}));
    // Floating fee bubbles rising from hand
    const feeBubbles=Array.from({length:10},(_,i)=>spawnBubble(true,i));
    function spawnBubble(rand=false,idx=0){
      return{x:(Math.random()-0.5)*50,y:rand?-Math.random()*120:0,vy:-(0.4+Math.random()*0.5),vx:(Math.random()-0.5)*0.3,life:rand?Math.random():1,size:3+Math.random()*3.5,label:["$0","FREE","PAID","0 ETH"][Math.floor(Math.random()*4)]};
    }
    function spawnP(r=false){return{x:18+Math.random()*364,y:r?HEAD_KILL_Y+Math.random()*(H-HEAD_KILL_Y):H+2,vy:-(0.45+Math.random()*0.75),vx:(Math.random()-0.5)*0.22,life:r?Math.random():1,char:CHARS[Math.floor(Math.random()*CHARS.length)],size:8+Math.random()*5};}
    const glow=(c,b)=>{ctx.shadowColor=c;ctx.shadowBlur=b;};const noG=()=>{ctx.shadowBlur=0;};

    function drawBG(){
      ctx.fillStyle="#020617";ctx.fillRect(0,0,W,H);
      const bg=ctx.createRadialGradient(200,300,0,200,300,230);
      bg.addColorStop(0,"rgba(34,197,94,0.09)");bg.addColorStop(0.6,"rgba(34,197,94,0.025)");bg.addColorStop(1,"transparent");
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(34,197,94,0.04)";ctx.lineWidth=0.5;
      for(let x=0;x<=W;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<=H;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      const v=ctx.createRadialGradient(200,280,130,200,280,310);
      v.addColorStop(0,"transparent");v.addColorStop(1,"rgba(0,0,0,0.48)");
      ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
    }

    function drawParticles(){
      ctx.textAlign="center";ctx.textBaseline="middle";
      dataStream.forEach(p=>{
        p.x+=p.vx;p.y+=p.vy;p.life-=0.003;
        if(p.life<=0||p.y<HEAD_KILL_Y){Object.assign(p,spawnP());return;}
        const fade=Math.min((p.y-HEAD_KILL_Y)/70,1);
        ctx.globalAlpha=Math.min(p.life*0.5,0.25)*fade;
        ctx.font=`${p.size}px 'Courier New',monospace`;ctx.fillStyle=AC;ctx.fillText(p.char,p.x,p.y);
      });ctx.globalAlpha=1;
    }

    function drawHeader(){
      ctx.save();
      ctx.strokeStyle="rgba(34,197,94,0.45)";ctx.lineWidth=1.4;
      const bL=14;
      [[5,5,1,1],[395,5,-1,1]].forEach(([x,y,dx,dy])=>{ctx.beginPath();ctx.moveTo(x+dx*bL,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*bL);ctx.stroke();});
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="bold 12px 'Courier New',monospace";ctx.fillStyle="rgba(34,197,94,0.6)";
      ctx.fillText("GASLESS TRANSACTION LAYER · META-TX RELAY",200,17);
      glow(AC,22);ctx.font="bold 28px 'Courier New',monospace";ctx.fillStyle="#ffffff";ctx.fillText("AGENT GAS",200,46);noG();
      // const blink=Math.sin(t*3.5)>0;
      // ctx.fillStyle=blink?AC:"rgba(34,197,94,0.35)";glow(AC,blink?8:0);ctx.beginPath();ctx.arc(87,63,3.5,0,Math.PI*2);ctx.fill();noG();
      // ctx.fillStyle="rgba(34,197,94,0.8)";ctx.font="bold 9px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText("PHASE 1  ·  BASE L2  ·  ERC-4337",95,63);
      const dg=ctx.createLinearGradient(0,DIVIDER_Y,W,DIVIDER_Y);
      dg.addColorStop(0,"transparent");dg.addColorStop(0.08,"rgba(34,197,94,0.28)");dg.addColorStop(0.5,"rgba(34,197,94,0.6)");dg.addColorStop(0.92,"rgba(34,197,94,0.28)");dg.addColorStop(1,"transparent");
      ctx.strokeStyle=dg;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,DIVIDER_Y);ctx.lineTo(W,DIVIDER_Y);ctx.stroke();
      [40,100,160,200,240,300,360].forEach(x=>{ctx.strokeStyle="rgba(34,197,94,0.4)";ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(x,DIVIDER_Y-3);ctx.lineTo(x,DIVIDER_Y+3);ctx.stroke();});
      ctx.restore();
    }

    function drawPanels(){
      ctx.save();ctx.textBaseline="middle";
      function panel(x,title,rows,dotColor){
        const y=PANEL_Y,w=192,h=PANEL_H;
        ctx.fillStyle="rgba(2,10,28,0.94)";ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.fill();
        glow(AC,12);ctx.strokeStyle="rgba(34,197,94,0.5)";ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.stroke();noG();
        ctx.fillStyle="rgba(34,197,94,0.10)";ctx.beginPath();ctx.roundRect(x,y,w,16,[7,7,0,0]);ctx.fill();
        ctx.strokeStyle="rgba(34,197,94,0.15)";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(x+2,y+16);ctx.lineTo(x+w-2,y+16);ctx.stroke();
        ctx.fillStyle=AC;ctx.font="bold 9px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText(title,x+9,y+8);
        if(dotColor){const on=Math.sin(t*3.8)>0;ctx.fillStyle=on?dotColor:dotColor+"44";glow(dotColor,on?10:0);ctx.beginPath();ctx.arc(x+w-11,y+8,3.5,0,Math.PI*2);ctx.fill();noG();}
        rows.forEach(([label,value,color],i)=>{
          const ry=y+22+i*10;
          ctx.fillStyle="rgba(255,255,255,0.40)";ctx.font="8px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText(label,x+9,ry);
          ctx.fillStyle=color||AC;ctx.font="bold 10px 'Courier New',monospace";ctx.textAlign="right";glow(color||AC,4);ctx.fillText(value,x+w-8,ry);noG();
        });
      }
      // panel(4,"GAS COVERAGE",[["SPONSORED","1,247",AC],["SAVED (24H)","$84.30",AC],["AVG GAS","0.0 ETH",CY],["STATUS","ACTIVE",AC]],AC);
      // panel(204,"RELAY STATS",[["RELAY TXS","4,891",AC],["SUCCESS","99.8%",AC],["PAYMSTR","LIVE","#22d3ee"],["BALANCE","$12,400",CY]],CY);
      ctx.restore();
    }

    function drawGround(){
      const cx=200,cy=462,p=0.82+Math.sin(t*2.2)*0.18;
      const gg=ctx.createRadialGradient(cx,cy,0,cx,cy,100*p);
      gg.addColorStop(0,"rgba(34,197,94,0.07)");gg.addColorStop(0.6,"rgba(34,197,94,0.02)");gg.addColorStop(1,"transparent");
      ctx.fillStyle=gg;ctx.beginPath();ctx.ellipse(cx,cy,100*p,18,0,0,Math.PI*2);ctx.fill();
      glow(AC,12*p);ctx.strokeStyle=`rgba(34,197,94,${0.28+Math.sin(t*2.2)*0.1})`;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(cx,cy,88*p,14,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(34,197,94,${0.45+Math.sin(t*2.2)*0.12})`;ctx.lineWidth=1.8;
      ctx.beginPath();ctx.ellipse(cx,cy,60*p,10,0,0,Math.PI*2);ctx.stroke();noG();
      for(let i=0;i<10;i++){const a=(i/10)*Math.PI*2+t*0.6;glow(AC,6);ctx.fillStyle=`rgba(34,197,94,${0.4+Math.sin(t*3+i)*0.3})`;ctx.beginPath();ctx.arc(cx+Math.cos(a)*74,cy+Math.sin(a)*12,2.2,0,Math.PI*2);ctx.fill();}noG();
    }

    function drawCharacter(fy){
      const cx=200;
      const bob=Math.sin(t*0.85)*7;
      const wave=Math.sin(t*1.4)*0.18; // right arm wave angle
      const handX=cx+98,handY=300+fy+bob;

      // ── FUEL NOZZLE in left hand ──────────────────────────────────
      const nozX=cx-105,nozY=305+fy+bob;
      ctx.save();
      ctx.translate(nozX,nozY);ctx.rotate(-0.3);
      // Hose
      ctx.beginPath();ctx.moveTo(28,-10);ctx.bezierCurveTo(60,-8,80,20,65,50);
      ctx.strokeStyle="#0d1c10";ctx.lineWidth=8;ctx.lineCap="round";ctx.stroke();
      glow(AC,6);ctx.strokeStyle="rgba(34,197,94,0.4)";ctx.lineWidth=1;ctx.stroke();noG();
      // Nozzle body
      ctx.beginPath();ctx.roundRect(-28,-14,56,22,5);
      const nozG=ctx.createLinearGradient(-28,-14,28,-14);
      nozG.addColorStop(0,"#0a1c0e");nozG.addColorStop(0.5,"#0f2a14");nozG.addColorStop(1,"#0a1c0e");
      ctx.fillStyle=nozG;ctx.fill();glow(AC,10);ctx.strokeStyle=AC;ctx.lineWidth=1.4;ctx.stroke();noG();
      // Nozzle tip
      ctx.beginPath();ctx.roundRect(28,-8,22,16,8);
      ctx.fillStyle="#143d18";ctx.fill();glow(AC,14);ctx.strokeStyle=AC;ctx.lineWidth=1.2;ctx.stroke();noG();
      // Display on nozzle
      ctx.fillStyle="rgba(34,197,94,0.15)";ctx.beginPath();ctx.roundRect(-18,-10,30,14,3);ctx.fill();
      ctx.fillStyle=AC;ctx.font="bold 8px 'Courier New',monospace";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText("$0.00",-4,-4);
      // Green LED strip
      glow(AC,10);ctx.strokeStyle=AC;ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(-26,-16);ctx.lineTo(26,-16);ctx.stroke();noG();
      ctx.restore();

      // ── FEE BUBBLES rising from right hand ────────────────────────
      feeBubbles.forEach(b=>{
        b.x+=b.vx;b.y+=b.vy;b.life-=0.006;
        if(b.life<=0){Object.assign(b,spawnBubble());b.x=(Math.random()-0.5)*50;b.y=0;}
        const bAlpha=Math.min(b.life*1.2,0.85);
        const bY=handY+b.y,bX=handX+b.x;
        ctx.globalAlpha=bAlpha;
        // Bubble circle
        const bR=b.size;
        const bG=ctx.createRadialGradient(bX,bY,0,bX,bY,bR);
        bG.addColorStop(0,"rgba(34,197,94,0.25)");bG.addColorStop(1,"rgba(34,197,94,0.06)");
        ctx.fillStyle=bG;ctx.beginPath();ctx.arc(bX,bY,bR,0,Math.PI*2);ctx.fill();
        glow(AC,4);ctx.strokeStyle=`rgba(34,197,94,0.6)`;ctx.lineWidth=0.7;ctx.stroke();noG();
        ctx.fillStyle=AC;ctx.font=`bold ${b.size*1.4}px 'Courier New',monospace`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(b.label,bX,bY);
        ctx.globalAlpha=1;
      });

      // ── LEGS ──────────────────────────────────────────────────────
      ctx.save();
      [[cx-20],[cx+8]].forEach(([x0],leg)=>{
        const lg=ctx.createLinearGradient(x0,355+fy,x0+22,455+fy);
        lg.addColorStop(0,"#0a1c0e");lg.addColorStop(1,"#060e07");
        ctx.beginPath();ctx.roundRect(x0,355+fy+bob,22,46,[6,6,4,4]);ctx.fillStyle=lg;ctx.fill();
        ctx.strokeStyle="rgba(34,197,94,0.22)";ctx.lineWidth=0.9;ctx.stroke();
        ctx.beginPath();ctx.roundRect(x0+1,399+fy+bob,20,38,[4,4,5,5]);ctx.fillStyle=lg;ctx.fill();ctx.stroke();
        // Knee pad
        ctx.beginPath();ctx.roundRect(x0+2,405+fy+bob,16,18,3);ctx.fillStyle="rgba(34,197,94,0.1)";ctx.fill();
        glow(AC,4);ctx.strokeStyle="rgba(34,197,94,0.4)";ctx.lineWidth=0.8;ctx.stroke();noG();
        // Boot
        const bx=x0-3;
        const bg3=ctx.createLinearGradient(bx,436+fy+bob,bx,450+fy+bob);
        bg3.addColorStop(0,"#0a1c0e");bg3.addColorStop(1,"#050c06");
        ctx.beginPath();ctx.moveTo(bx,436+fy+bob);ctx.lineTo(bx-3,450+fy+bob);ctx.lineTo(bx+30,450+fy+bob);ctx.lineTo(bx+27,436+fy+bob);ctx.closePath();
        ctx.fillStyle=bg3;ctx.fill();glow(AC,4);ctx.strokeStyle="rgba(34,197,94,0.38)";ctx.lineWidth=0.9;ctx.stroke();noG();
        ctx.strokeStyle="rgba(34,197,94,0.3)";ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(bx-2,448+fy+bob);ctx.lineTo(bx+28,448+fy+bob);ctx.stroke();
      });
      ctx.restore();

      // ── TORSO ─────────────────────────────────────────────────────
      ctx.save();
      const torsoY=230+fy+bob;
      // Body
      ctx.beginPath();ctx.moveTo(cx-44,torsoY);ctx.bezierCurveTo(cx-48,torsoY+38,cx-50,torsoY+78,cx-44,torsoY+118);
      ctx.lineTo(cx+44,torsoY+118);ctx.bezierCurveTo(cx+50,torsoY+78,cx+48,torsoY+38,cx+44,torsoY);ctx.closePath();
      const tg=ctx.createLinearGradient(cx-50,torsoY,cx+50,torsoY+118);
      tg.addColorStop(0,"#081808");tg.addColorStop(0.4,"#061206");tg.addColorStop(1,"#040c04");
      ctx.fillStyle=tg;ctx.fill();ctx.strokeStyle="rgba(34,197,94,0.2)";ctx.lineWidth=1;ctx.stroke();
      // Uniform front panel
      ctx.beginPath();ctx.moveTo(cx-32,torsoY+4);ctx.bezierCurveTo(cx-34,torsoY+38,cx-35,torsoY+76,cx-30,torsoY+112);
      ctx.lineTo(cx+30,torsoY+112);ctx.bezierCurveTo(cx+35,torsoY+76,ctx+34,torsoY+38,cx+32,torsoY+4);ctx.closePath();
      const ug=ctx.createLinearGradient(cx,torsoY,cx,torsoY+112);
      ug.addColorStop(0,"#0e2c0e");ug.addColorStop(0.3,"#0a2008");ug.addColorStop(1,"#071808");
      ctx.fillStyle=ug;ctx.fill();ctx.strokeStyle="rgba(34,197,94,0.4)";ctx.lineWidth=1.2;ctx.stroke();
      // Uniform top seam
      const teh=ctx.createLinearGradient(cx-32,torsoY+4,cx+32,torsoY+4);
      teh.addColorStop(0,"transparent");teh.addColorStop(0.3,"rgba(34,197,94,0.5)");teh.addColorStop(0.7,"rgba(34,197,94,0.5)");teh.addColorStop(1,"transparent");
      ctx.strokeStyle=teh;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx-32,torsoY+6);ctx.lineTo(cx+32,torsoY+6);ctx.stroke();
      // Chest badge/logo
      ctx.fillStyle="rgba(34,197,94,0.1)";ctx.beginPath();ctx.roundRect(cx-26,torsoY+18,52,44,6);ctx.fill();
      glow(AC,8);ctx.strokeStyle="rgba(34,197,94,0.5)";ctx.lineWidth=1;ctx.stroke();noG();
      // Gas station symbol — fuel pump outline
      glow(AC,12);ctx.strokeStyle=AC;ctx.lineWidth=1.6;
      ctx.beginPath();ctx.roundRect(cx-14,torsoY+24,18,30,3);ctx.stroke();
      ctx.beginPath();ctx.roundRect(cx-10,torsoY+28,10,14,2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+4,torsoY+32);ctx.lineTo(cx+14,torsoY+28);ctx.lineTo(cx+14,torsoY+38);ctx.stroke();noG();
      // G logo
      ctx.fillStyle=AC;ctx.font="bold 10px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("G",cx+4,torsoY+50);
      // Power core
      const cp=0.6+Math.sin(t*2.8)*0.4;
      glow(AC,20*cp);
      ctx.beginPath();ctx.moveTo(cx,torsoY+66);ctx.lineTo(cx+11,torsoY+78);ctx.lineTo(cx,torsoY+90);ctx.lineTo(cx-11,torsoY+78);ctx.closePath();
      ctx.fillStyle=`rgba(34,197,94,${0.1+cp*0.08})`;ctx.fill();ctx.strokeStyle=AC;ctx.lineWidth=1.2;ctx.stroke();
      const cr=ctx.createRadialGradient(cx,torsoY+78,0,cx,torsoY+78,5);
      cr.addColorStop(0,"#fff");cr.addColorStop(0.4,"#86efac");cr.addColorStop(1,AC);
      ctx.fillStyle=cr;ctx.beginPath();ctx.arc(cx,torsoY+78,5,0,Math.PI*2);ctx.fill();noG();
      // Shoulder pauldrons
      [[cx-44,cx-40,cx-66,cx-62,cx-60,cx-42],[cx+44,cx+40,cx+66,cx+62,cx+60,cx+42]].forEach(([x0,,x2,x3,x4,x5],s)=>{
        const d=s===0?-1:1;
        ctx.beginPath();ctx.moveTo(x0,torsoY);ctx.bezierCurveTo(x2,torsoY-8,x3+d*3,torsoY-10,x4,torsoY+12);
        ctx.bezierCurveTo(x3,torsoY+24,x0+d*(-6+d*12),torsoY+26,x5,torsoY+22);ctx.closePath();
        const sg=ctx.createLinearGradient(x0,torsoY-10,x5,torsoY+26);sg.addColorStop(0,"#102810");sg.addColorStop(1,"#061006");
        ctx.fillStyle=sg;ctx.fill();glow(AC,6);ctx.strokeStyle="rgba(34,197,94,0.55)";ctx.lineWidth=1.2;ctx.stroke();noG();
      });
      // Belt
      const bg2=ctx.createLinearGradient(cx-44,torsoY+112,cx+44,torsoY+112);
      bg2.addColorStop(0,"#071507");bg2.addColorStop(0.5,"#0e280e");bg2.addColorStop(1,"#071507");
      ctx.beginPath();ctx.roundRect(cx-44,torsoY+110,88,14,4);ctx.fillStyle=bg2;ctx.fill();
      ctx.strokeStyle="rgba(34,197,94,0.45)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.roundRect(cx-12,torsoY+108,24,18,4);ctx.fillStyle="#091409";ctx.fill();
      glow(AC,8);ctx.strokeStyle=AC;ctx.lineWidth=1.4;ctx.stroke();noG();
      ctx.fillStyle=AC;ctx.font="bold 9px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("Γ",cx,torsoY+117);
      ctx.restore();

      // ── LEFT ARM (holding nozzle) ─────────────────────────────────
      ctx.save();
      const laY=torsoY+fy+bob+230;
      ctx.beginPath();ctx.moveTo(cx-44,torsoY+fy+bob+12);ctx.bezierCurveTo(cx-65,torsoY+fy+bob+38,cx-85,torsoY+fy+bob+62,nozX+28,nozY-6);
      ctx.strokeStyle="#0a1c0e";ctx.lineWidth=20;ctx.lineCap="round";ctx.stroke();
      ctx.strokeStyle="rgba(34,197,94,0.22)";ctx.lineWidth=1.2;ctx.stroke();
      // Forearm
      ctx.beginPath();ctx.moveTo(cx-84,torsoY+fy+bob+72);ctx.lineTo(nozX+10,nozY+2);
      ctx.strokeStyle="#091508";ctx.lineWidth=15;ctx.stroke();
      ctx.strokeStyle="rgba(34,197,94,0.2)";ctx.lineWidth=1;ctx.stroke();
      // Forearm bracer
      ctx.beginPath();ctx.roundRect(cx-92,torsoY+fy+bob+70,26,22,4);ctx.fillStyle="#0e2010";ctx.fill();
      glow(AC,5);ctx.strokeStyle="rgba(34,197,94,0.45)";ctx.lineWidth=0.9;ctx.stroke();noG();
      ctx.restore();

      // ── RIGHT ARM (raised, palm out, offering) ─────────────────────
      ctx.save();
      ctx.translate(cx,torsoY+fy+bob);
      ctx.rotate(wave*0.3);
      // Upper arm
      ctx.beginPath();ctx.moveTo(44,12);ctx.bezierCurveTo(66,30,80,58,88,88);
      ctx.strokeStyle="#0a1c0e";ctx.lineWidth=20;ctx.lineCap="round";ctx.stroke();
      ctx.strokeStyle="rgba(34,197,94,0.22)";ctx.lineWidth=1.2;ctx.stroke();
      // Forearm - angled up/outward
      ctx.beginPath();ctx.moveTo(88,88);ctx.bezierCurveTo(96,68,102,42,98,18);
      ctx.strokeStyle="#091508";ctx.lineWidth=15;ctx.stroke();
      ctx.strokeStyle="rgba(34,197,94,0.22)";ctx.lineWidth=1;ctx.stroke();
      // PALM - open hand facing user
      ctx.save();ctx.translate(98,14);
      // Palm base
      ctx.beginPath();ctx.ellipse(0,0,18,14,0.15,0,Math.PI*2);
      const pgr=ctx.createRadialGradient(0,0,0,0,0,18);
      pgr.addColorStop(0,"#0e2810");pgr.addColorStop(1,"#091808");
      ctx.fillStyle=pgr;ctx.fill();
      glow(AC,10);ctx.strokeStyle="rgba(34,197,94,0.55)";ctx.lineWidth=1.2;ctx.stroke();noG();
      // Palm glow center
      glow(AC,16);const palmGlow=ctx.createRadialGradient(0,0,0,0,0,10);
      palmGlow.addColorStop(0,"rgba(34,197,94,0.4)");palmGlow.addColorStop(1,"transparent");
      ctx.fillStyle=palmGlow;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();noG();
      // Fingers - 4 lines
      ctx.strokeStyle="rgba(34,197,94,0.45)";ctx.lineWidth=4;ctx.lineCap="round";
      [[-10,-12],[-4,-14],[4,-14],[10,-12]].forEach(([fx,fy2])=>{ctx.beginPath();ctx.moveTo(fx,fy2+3);ctx.lineTo(fx*1.1,fy2-9);ctx.stroke();});
      ctx.strokeStyle="rgba(34,197,94,0.6)";ctx.lineWidth=0.8;
      [[-10,-12],[-4,-14],[4,-14],[10,-12]].forEach(([fx,fy2])=>{ctx.beginPath();ctx.moveTo(fx,fy2+3);ctx.lineTo(fx*1.1,fy2-9);ctx.stroke();});
      ctx.restore();
      ctx.restore();

      // ── HEAD ──────────────────────────────────────────────────────
      const headCY=torsoY+fy+bob-42;
      ctx.save();
      // Neck
      ctx.beginPath();ctx.roundRect(cx-11,headCY+32,22,22,3);
      const ng2=ctx.createLinearGradient(cx-11,headCY+32,cx+11,headCY+32);
      ng2.addColorStop(0,"#071207");ng2.addColorStop(0.5,"#0e2010");ng2.addColorStop(1,"#071207");
      ctx.fillStyle=ng2;ctx.fill();ctx.strokeStyle="rgba(34,197,94,0.2)";ctx.lineWidth=0.8;ctx.stroke();
      // Head shape - round friendly robot
      const hg=ctx.createRadialGradient(cx,headCY,0,cx,headCY,38);
      hg.addColorStop(0,"#0e2a0e");hg.addColorStop(0.6,"#091808");hg.addColorStop(1,"#050e05");
      ctx.beginPath();ctx.ellipse(cx,headCY,36,40,0,0,Math.PI*2);ctx.fillStyle=hg;ctx.fill();ctx.strokeStyle="rgba(34,197,94,0.28)";ctx.lineWidth=1;ctx.stroke();
      // Cap / visor top
      ctx.beginPath();ctx.moveTo(cx-38,headCY-12);ctx.bezierCurveTo(cx-42,headCY-38,cx-38,headCY-56,cx-18,headCY-64);
      ctx.bezierCurveTo(cx-5,headCY-70,cx+5,headCY-70,cx+18,headCY-64);
      ctx.bezierCurveTo(cx+38,headCY-56,cx+42,headCY-38,cx+38,headCY-12);ctx.closePath();
      const capG=ctx.createLinearGradient(cx-42,headCY-70,cx+42,headCY-12);
      capG.addColorStop(0,"#071207");capG.addColorStop(0.5,"#0c1e0c");capG.addColorStop(1,"#081408");
      ctx.fillStyle=capG;ctx.fill();ctx.strokeStyle="rgba(34,197,94,0.35)";ctx.lineWidth=1.3;ctx.stroke();
      // Cap brim - GAS STATION ATTENDANT cap brim
      ctx.beginPath();ctx.ellipse(cx-8,headCY-14,50,10,0.05,Math.PI,Math.PI*2);
      const brimG2=ctx.createLinearGradient(cx-58,headCY-14,cx+42,headCY-14);
      brimG2.addColorStop(0,"#060e06");brimG2.addColorStop(0.5,"#0e2010");brimG2.addColorStop(1,"#060e06");
      ctx.fillStyle=brimG2;ctx.fill();glow(AC,6);ctx.strokeStyle="rgba(34,197,94,0.4)";ctx.lineWidth=1.2;ctx.stroke();noG();
      // Cap badge
      ctx.fillStyle="rgba(34,197,94,0.15)";ctx.beginPath();ctx.ellipse(cx,headCY-45,14,10,0,0,Math.PI*2);ctx.fill();
      glow(AC,8);ctx.strokeStyle=AC;ctx.lineWidth=1;ctx.stroke();noG();
      ctx.fillStyle=AC;ctx.font="bold 8px 'Courier New',monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("GAS",cx,headCY-45);
      // Face plate
      ctx.beginPath();ctx.moveTo(cx-28,headCY-4);ctx.bezierCurveTo(cx-30,headCY+10,cx-27,headCY+22,cx-16,headCY+28);
      ctx.lineTo(cx+16,headCY+28);ctx.bezierCurveTo(cx+27,headCY+22,cx+30,headCY+10,cx+28,headCY-4);ctx.closePath();
      const fGr=ctx.createLinearGradient(cx,headCY-4,cx,headCY+28);
      fGr.addColorStop(0,"#0c2810");fGr.addColorStop(1,"#060e06");
      ctx.fillStyle=fGr;ctx.fill();ctx.strokeStyle="rgba(34,197,94,0.35)";ctx.lineWidth=1;ctx.stroke();
      // Eyes — two round friendly green eyes
      const eyeBlink=Math.sin(t*0.5)>0.95?0:1;
      [[cx-10,headCY+6],[cx+10,headCY+6]].forEach(([ex,ey])=>{
        glow(AC,14);
        if(eyeBlink){
          ctx.fillStyle=AC;ctx.beginPath();ctx.arc(ex,ey,6,0,Math.PI*2);ctx.fill();
          const eg2=ctx.createRadialGradient(ex,ey,0,ex,ey,6);
          eg2.addColorStop(0,"#fff");eg2.addColorStop(0.3,"#86efac");eg2.addColorStop(1,AC);
          ctx.fillStyle=eg2;ctx.fill();
        } else {
          // Blink - thin line
          ctx.fillStyle=AC;ctx.beginPath();ctx.ellipse(ex,ey,6,1.5,0,0,Math.PI*2);ctx.fill();
        }
        noG();
      });
      // Smile indicator (green LED strip)
      glow(AC,8);ctx.strokeStyle=`rgba(34,197,94,0.7)`;ctx.lineWidth=2.5;ctx.lineCap="round";
      ctx.beginPath();ctx.arc(cx,headCY+20,8,0.2,Math.PI-0.2);ctx.stroke();noG();
      // Antenna
      glow(AC,14);ctx.strokeStyle=AC;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(cx+2,headCY-62);ctx.lineTo(cx+2,headCY-80);ctx.stroke();noG();
      const antPulse=0.7+Math.sin(t*3.5)*0.3;
      glow(AC,14*antPulse);ctx.fillStyle=`rgba(34,197,94,${antPulse})`;
      ctx.beginPath();ctx.arc(cx+2,headCY-82,4,0,Math.PI*2);ctx.fill();noG();
      ctx.restore();

      // ── ORBITERS ──────────────────────────────────────────────────
      orbiters.forEach(p=>{
        p.angle+=p.speed;glow(AC,8);ctx.fillStyle=`rgba(34,197,94,${0.35+Math.sin(p.angle*4)*0.25})`;
        ctx.beginPath();ctx.arc(cx+Math.cos(p.angle)*p.r,(torsoY+fy+bob+60)+Math.sin(p.angle)*(p.r*0.2)+p.yMod,p.size,0,Math.PI*2);ctx.fill();
      });noG();
    }

    function render(){
      t+=0.016;const fy=Math.sin(t*0.85)*7;
      ctx.clearRect(0,0,W,H);drawBG();drawParticles();drawHeader();drawPanels();
      ctx.save();ctx.translate(0,CHAR_OFFSET);drawGround();drawCharacter(fy);ctx.restore();
      raf=requestAnimationFrame(render);
    }
    render();return()=>cancelAnimationFrame(raf);
  },[]);

  if (compact) return <canvas ref={canvasRef} width={400} height={520} style={{ display:"block" }} />;
  return(
    <div style={{background:"#010814",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{borderRadius:18,overflow:"hidden",border:"1px solid rgba(34,197,94,0.3)",boxShadow:"0 0 60px rgba(34,197,94,0.10), 0 0 3px rgba(34,197,94,0.28)"}}>
        <canvas ref={canvasRef} width={400} height={520} style={{display:"block"}}/>
      </div>
    </div>
  );
}
