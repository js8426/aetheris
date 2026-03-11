import { useEffect, useRef } from "react";
export default function AgentBeta({ compact = false } = {}) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf, t = 0;
    const W=400,H=520,HEADER_H=68,DIVIDER_Y=68,PANEL_Y=72,PANEL_H=58,CHAR_OFFSET=0,HEAD_KILL_Y=210;
    const P="#a855f7",PD="rgba(168,85,247,",GR="#22c55e",RD="#ef4444";
    const CHARS=["0xA3","FUND","RATE","LONG","SHORT","0x2F","PERP","BUY","SELL","0xB1","0x9C","ARB","ETH","$$$"];
    const dataStream=Array.from({length:40},()=>spawnP(true));
    const orbiters=Array.from({length:12},(_,i)=>({angle:(i/12)*Math.PI*2,r:115+(i%3)*14,speed:0.006+(i%4)*0.003,size:1.1+(i%3)*0.6,yMod:(i%5)*7-14}));
    function spawnP(r=false){return{x:18+Math.random()*364,y:r?HEAD_KILL_Y+Math.random()*(H-HEAD_KILL_Y):H+2,vy:-(0.45+Math.random()*0.75),vx:(Math.random()-0.5)*0.22,life:r?Math.random():1,char:CHARS[Math.floor(Math.random()*CHARS.length)],size:8+Math.random()*5};}
    const glow=(c,b)=>{ctx.shadowColor=c;ctx.shadowBlur=b;};
    const noG=()=>{ctx.shadowBlur=0;};

    function drawBG(){
      ctx.fillStyle="#020617";ctx.fillRect(0,0,W,H);
      const bg=ctx.createRadialGradient(200,300,0,200,300,230);
      bg.addColorStop(0,"rgba(168,85,247,0.09)");bg.addColorStop(0.6,"rgba(168,85,247,0.025)");bg.addColorStop(1,"transparent");
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(168,85,247,0.04)";ctx.lineWidth=0.5;
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
        ctx.font=`${p.size}px 'Courier New',monospace`;ctx.fillStyle=P;
        ctx.fillText(p.char,p.x,p.y);
      });ctx.globalAlpha=1;
    }

    function drawHeader(){
      ctx.save();
      ctx.strokeStyle="rgba(168,85,247,0.45)";ctx.lineWidth=1.4;
      const bL=14;
      [[5,5,1,1],[395,5,-1,1]].forEach(([x,y,dx,dy])=>{ctx.beginPath();ctx.moveTo(x+dx*bL,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*bL);ctx.stroke();});
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="bold 12px 'Courier New',monospace";ctx.fillStyle="rgba(168,85,247,0.6)";
      ctx.fillText("FUNDING RATE HARVESTER · DELTA-NEUTRAL",200,17);
      glow(P,22);ctx.font="bold 28px 'Courier New',monospace";ctx.fillStyle="#ffffff";
      ctx.fillText("AGENT BETA",200,46);noG();
      // const blink=Math.sin(t*3.5)>0;
      // ctx.fillStyle=blink?P:"rgba(168,85,247,0.35)";glow(P,blink?8:0);
      // ctx.beginPath();ctx.arc(88,63,3.5,0,Math.PI*2);ctx.fill();noG();
      // ctx.fillStyle="rgba(168,85,247,0.8)";ctx.font="bold 9px 'Courier New',monospace";
      // ctx.textAlign="left";ctx.fillText("PHASE 1  ·  BASE L2  ·  ERC-4337",96,63);
      const dg=ctx.createLinearGradient(0,DIVIDER_Y,W,DIVIDER_Y);
      dg.addColorStop(0,"transparent");dg.addColorStop(0.08,"rgba(168,85,247,0.28)");
      dg.addColorStop(0.5,"rgba(168,85,247,0.6)");dg.addColorStop(0.92,"rgba(168,85,247,0.28)");dg.addColorStop(1,"transparent");
      ctx.strokeStyle=dg;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,DIVIDER_Y);ctx.lineTo(W,DIVIDER_Y);ctx.stroke();
      [40,100,160,200,240,300,360].forEach(x=>{ctx.strokeStyle="rgba(168,85,247,0.4)";ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(x,DIVIDER_Y-3);ctx.lineTo(x,DIVIDER_Y+3);ctx.stroke();});
      ctx.restore();
    }

    function drawPanels(){
      ctx.save();ctx.textBaseline="middle";
      function panel(x,title,rows,dotColor){
        const y=PANEL_Y,w=192,h=PANEL_H;
        ctx.fillStyle="rgba(2,10,28,0.94)";ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.fill();
        glow(P,12);ctx.strokeStyle="rgba(168,85,247,0.5)";ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.stroke();noG();
        ctx.fillStyle="rgba(168,85,247,0.10)";ctx.beginPath();ctx.roundRect(x,y,w,16,[7,7,0,0]);ctx.fill();
        ctx.strokeStyle="rgba(168,85,247,0.15)";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(x+2,y+16);ctx.lineTo(x+w-2,y+16);ctx.stroke();
        ctx.fillStyle=P;ctx.font="bold 9px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText(title,x+9,y+8);
        if(dotColor){const on=Math.sin(t*3.8)>0;ctx.fillStyle=on?dotColor:dotColor+"44";glow(dotColor,on?10:0);ctx.beginPath();ctx.arc(x+w-11,y+8,3.5,0,Math.PI*2);ctx.fill();noG();}
        rows.forEach(([label,value,color],i)=>{
          const ry=y+22+i*10;
          ctx.fillStyle="rgba(255,255,255,0.40)";ctx.font="8px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText(label,x+9,ry);
          ctx.fillStyle=color||P;ctx.font="bold 10px 'Courier New',monospace";ctx.textAlign="right";glow(color||P,4);ctx.fillText(value,x+w-8,ry);noG();
        });
      }
      // panel(4,"FUNDING RATES",[["BINANCE","0.021%",GR],["BYBIT","0.018%",P],["SPREAD","0.003%",GR],["STATUS","HARVEST",GR]],GR);
      // panel(204,"POSITION STATS",[["NET PnL","+$847","#22d3ee"],["L/S RATIO","1.02",GR],["APY (LIVE)","18.4%",GR],["DELTA","NEUTRAL",P]],P);
      ctx.restore();
    }

    function drawGround(){
      const cx=200,cy=462,p=0.82+Math.sin(t*2.2)*0.18;
      const gg=ctx.createRadialGradient(cx,cy,0,cx,cy,100*p);
      gg.addColorStop(0,"rgba(168,85,247,0.07)");gg.addColorStop(0.6,"rgba(168,85,247,0.02)");gg.addColorStop(1,"transparent");
      ctx.fillStyle=gg;ctx.beginPath();ctx.ellipse(cx,cy,100*p,18,0,0,Math.PI*2);ctx.fill();
      glow(P,12*p);ctx.strokeStyle=`rgba(168,85,247,${0.28+Math.sin(t*2.2)*0.1})`;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(cx,cy,88*p,14,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(168,85,247,${0.45+Math.sin(t*2.2)*0.12})`;ctx.lineWidth=1.8;
      ctx.beginPath();ctx.ellipse(cx,cy,60*p,10,0,0,Math.PI*2);ctx.stroke();noG();
      for(let i=0;i<10;i++){const a=(i/10)*Math.PI*2+t*0.6;glow(P,6);ctx.fillStyle=`rgba(168,85,247,${0.4+Math.sin(t*3+i)*0.3})`;ctx.beginPath();ctx.arc(cx+Math.cos(a)*74,cy+Math.sin(a)*12,2.2,0,Math.PI*2);ctx.fill();}noG();
    }

    function drawCharacter(fy){
      const cx=200;
      const sway=Math.sin(t*0.8)*5;
      const poleAngle=Math.sin(t*0.9)*0.055+Math.cos(t*1.8)*0.02;
      const sagAmt=14+Math.sin(t*1.5)*3;
      const gPulse=0.7+Math.sin(t*2.1)*0.3;
      const rPulse=0.7+Math.cos(t*2.3)*0.3;

      // ── POLES ──────────────────────────────────────────────────
      [[40,"LONG",GR,gPulse],[348,"SHORT",RD,rPulse]].forEach(([px,label,col,pulse],side)=>{
        const pg=ctx.createLinearGradient(px,125,px+12,125);
        pg.addColorStop(0,"#060f22");pg.addColorStop(0.5,"#0d1e38");pg.addColorStop(1,"#060f22");
        ctx.fillStyle=pg;ctx.beginPath();ctx.roundRect(px,130+fy,12,350,3);ctx.fill();
        glow(col,8);ctx.strokeStyle=`rgba(${col===GR?"34,197,94":"239,68,68"},${0.5*pulse})`;ctx.lineWidth=1;ctx.stroke();noG();
        // Cap
        const capG=ctx.createRadialGradient(px+6,128+fy,0,px+6,128+fy,20);
        capG.addColorStop(0,col==="#22c55e"?"rgba(34,197,94,0.5)":"rgba(239,68,68,0.5)");capG.addColorStop(1,"transparent");
        ctx.fillStyle=capG;ctx.beginPath();ctx.arc(px+6,128+fy,20,0,Math.PI*2);ctx.fill();
        glow(col,18*pulse);ctx.fillStyle=col;ctx.beginPath();ctx.arc(px+6,130+fy,9,0,Math.PI*2);ctx.fill();noG();
        ctx.fillStyle="#fff";ctx.font="bold 9px 'Courier New',monospace";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(label,px+6,130+fy);
        // Label on pole
        ctx.save();ctx.translate(px+6,260+fy);ctx.rotate(side===0?-Math.PI/2:Math.PI/2);
        ctx.fillStyle=`rgba(${col===GR?"34,197,94":"239,68,68"},0.55)`;ctx.font="bold 7px 'Courier New',monospace";ctx.textAlign="center";
        ctx.fillText(side===0?"LONG PERPS":"SHORT PERPS",0,0);ctx.restore();
      });

      // ── TIGHTROPE ────────────────────────────────────────────────
      const ropeY=390+fy;
      // Outer glow rope
      glow(P,8);ctx.strokeStyle="rgba(168,85,247,0.35)";ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(52,ropeY);
      ctx.quadraticCurveTo(cx+sway,ropeY+sagAmt+4,348,ropeY);ctx.stroke();
      // Core rope
      ctx.strokeStyle="rgba(220,200,255,0.7)";ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(52,ropeY);
      ctx.quadraticCurveTo(cx+sway,ropeY+sagAmt,348,ropeY);ctx.stroke();noG();
      // Rope shadow/depth
      ctx.strokeStyle="rgba(168,85,247,0.15)";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(52,ropeY+2);
      ctx.quadraticCurveTo(cx+sway,ropeY+sagAmt+6,348,ropeY+2);ctx.stroke();

      // ── BALANCE POLE ─────────────────────────────────────────────
      ctx.save();
      ctx.translate(cx+sway,198+fy);
      ctx.rotate(poleAngle);
      // Pole body
      const bpG=ctx.createLinearGradient(-118,-4,118,-4);
      bpG.addColorStop(0,"#06b6d4");bpG.addColorStop(0.3,P);bpG.addColorStop(0.5,"#c084fc");bpG.addColorStop(0.7,P);bpG.addColorStop(1,"#06b6d4");
      glow(P,12);ctx.fillStyle=bpG;ctx.beginPath();ctx.roundRect(-118,-3,236,6,3);ctx.fill();
      ctx.strokeStyle="rgba(200,160,255,0.5)";ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(-116,-1);ctx.lineTo(116,-1);ctx.stroke();noG();
      // Counter-weights
      [[-118,0],[118,0]].forEach(([wx,wy])=>{
        const wg=ctx.createRadialGradient(wx,wy,0,wx,wy,10);
        wg.addColorStop(0,"#c084fc");wg.addColorStop(0.5,P);wg.addColorStop(1,"#5b21b6");
        glow(P,14);ctx.fillStyle=wg;ctx.beginPath();ctx.arc(wx,wy,10,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle="rgba(220,200,255,0.6)";ctx.lineWidth=1.2;ctx.stroke();noG();
        ctx.fillStyle="#fff";ctx.font="bold 7px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("W",wx,wy);
      });
      ctx.restore();

      // ── ARMS ─────────────────────────────────────────────────────
      ctx.save();ctx.translate(sway,fy);
      // Left arm to balance pole grip
      const lGripY=198+Math.sin(poleAngle)*118;
      const rGripY=198-Math.sin(poleAngle)*118;
      ctx.beginPath();ctx.moveTo(cx-28,248);ctx.bezierCurveTo(cx-55,240,cx-88,235,cx-115,lGripY+3);
      ctx.strokeStyle="#0d1e36";ctx.lineWidth=16;ctx.lineCap="round";ctx.stroke();
      ctx.strokeStyle="rgba(168,85,247,0.3)";ctx.lineWidth=1.2;ctx.stroke();
      // Right arm
      ctx.beginPath();ctx.moveTo(cx+28,248);ctx.bezierCurveTo(cx+55,240,cx+88,235,cx+115,rGripY+3);
      ctx.strokeStyle="#0d1e36";ctx.lineWidth=16;ctx.stroke();
      ctx.strokeStyle="rgba(168,85,247,0.3)";ctx.lineWidth=1.2;ctx.stroke();
      // Hands
      [[cx-115,lGripY+3],[cx+115,rGripY+3]].forEach(([hx,hy])=>{
        ctx.beginPath();ctx.ellipse(hx,hy,7,8,0,0,Math.PI*2);ctx.fillStyle="#0a1828";ctx.fill();
        ctx.strokeStyle="rgba(168,85,247,0.4)";ctx.lineWidth=0.9;ctx.stroke();
      });
      ctx.restore();

      // ── LEGS ──────────────────────────────────────────────────────
      ctx.save();ctx.translate(sway,fy);
      [[cx-12,cx-14],[cx+12,cx+14]].forEach(([tx,fx2],leg)=>{
        // Shin
        ctx.beginPath();ctx.moveTo(tx,338);ctx.lineTo(fx2,390);
        ctx.strokeStyle="#0c1e38";ctx.lineWidth=14;ctx.lineCap="round";ctx.stroke();
        ctx.strokeStyle="rgba(168,85,247,0.2)";ctx.lineWidth=1;ctx.stroke();
        // Foot
        const bx=tx-6+(leg===0?-4:2);
        ctx.beginPath();ctx.moveTo(bx,388);ctx.lineTo(bx-3,398);ctx.lineTo(bx+20,398);ctx.lineTo(bx+18,388);ctx.closePath();
        ctx.fillStyle="#090f1e";ctx.fill();glow(P,4);ctx.strokeStyle="rgba(168,85,247,0.4)";ctx.lineWidth=0.8;ctx.stroke();noG();
        ctx.strokeStyle="rgba(168,85,247,0.35)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(bx-2,396);ctx.lineTo(bx+18,396);ctx.stroke();
      });
      ctx.restore();

      // ── TORSO ─────────────────────────────────────────────────────
      ctx.save();ctx.translate(sway,fy);
      // Torso body
      ctx.beginPath();ctx.moveTo(cx-30,252);ctx.bezierCurveTo(cx-32,280,cx-33,310,cx-28,338);
      ctx.lineTo(cx+28,338);ctx.bezierCurveTo(cx+33,310,cx+32,280,cx+30,252);ctx.closePath();
      const tg=ctx.createLinearGradient(cx-32,252,cx+32,338);
      tg.addColorStop(0,"#1a0a30");tg.addColorStop(0.5,"#120820");tg.addColorStop(1,"#0d0618");
      ctx.fillStyle=tg;ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.25)";ctx.lineWidth=1;ctx.stroke();
      // Armor plate
      ctx.beginPath();ctx.moveTo(cx-22,256);ctx.bezierCurveTo(cx-24,280,ctx-24,308,cx-20,332);
      ctx.lineTo(cx+20,332);ctx.bezierCurveTo(cx+24,308,cx+24,280,cx+22,256);ctx.closePath();
      const ag=ctx.createLinearGradient(cx,256,cx,332);
      ag.addColorStop(0,"#2d1050");ag.addColorStop(0.3,"#1e0a38");ag.addColorStop(1,"#130620");
      ctx.fillStyle=ag;ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.5)";ctx.lineWidth=1.2;ctx.stroke();
      // Top highlight
      const teh=ctx.createLinearGradient(cx-22,256,cx+22,256);
      teh.addColorStop(0,"transparent");teh.addColorStop(0.3,"rgba(168,85,247,0.5)");teh.addColorStop(0.7,"rgba(168,85,247,0.5)");teh.addColorStop(1,"transparent");
      ctx.strokeStyle=teh;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx-22,258);ctx.lineTo(cx+22,258);ctx.stroke();
      // Hex circuit
      ctx.strokeStyle="rgba(168,85,247,0.15)";ctx.lineWidth=0.7;
      [[cx,278],[cx-14,294],[cx+14,294],[cx,310],[cx-12,263],[cx+12,263]].forEach(([hx,hy])=>{
        ctx.beginPath();for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2-Math.PI/6;i===0?ctx.moveTo(hx+Math.cos(a)*9,hy+Math.sin(a)*9):ctx.lineTo(hx+Math.cos(a)*9,hy+Math.sin(a)*9);}ctx.closePath();ctx.stroke();
      });
      // Core diamond (purple)
      const cp=0.6+Math.sin(t*2.8)*0.4;
      glow(P,20*cp);
      ctx.beginPath();ctx.moveTo(cx,268);ctx.lineTo(cx+11,280);ctx.lineTo(cx,292);ctx.lineTo(cx-11,280);ctx.closePath();
      ctx.fillStyle=`rgba(168,85,247,${0.1+cp*0.08})`;ctx.fill();ctx.strokeStyle=P;ctx.lineWidth=1.2;ctx.stroke();
      const cr=ctx.createRadialGradient(cx,280,0,cx,280,5);
      cr.addColorStop(0,"#fff");cr.addColorStop(0.4,"#c084fc");cr.addColorStop(1,P);
      ctx.fillStyle=cr;ctx.beginPath();ctx.arc(cx,280,5,0,Math.PI*2);ctx.fill();noG();
      // Shoulder pads
      [[cx-30,cx-26,cx-50,cx-46,cx-44,cx-28],[cx+30,cx+26,cx+50,cx+46,cx+44,cx+28]].forEach(([x0,,x2,x3,x4,x5],s)=>{
        const d=s===0?-1:1;
        ctx.beginPath();ctx.moveTo(x0,244);ctx.bezierCurveTo(x2,238,x3+d*3,234,x4,252);ctx.bezierCurveTo(x3,266,x0+d*(-6+d*12),268,x5,264);ctx.closePath();
        const sg=ctx.createLinearGradient(x0,234,x5,268);sg.addColorStop(0,"#2a0850");sg.addColorStop(1,"#0d0618");
        ctx.fillStyle=sg;ctx.fill();glow(P,6);ctx.strokeStyle="rgba(168,85,247,0.6)";ctx.lineWidth=1.2;ctx.stroke();noG();
      });
      // Belt
      const bg2=ctx.createLinearGradient(cx-30,332,cx+30,332);
      bg2.addColorStop(0,"#180630");bg2.addColorStop(0.5,"#25094a");bg2.addColorStop(1,"#180630");
      ctx.beginPath();ctx.roundRect(cx-30,332,60,12,3);ctx.fillStyle=bg2;ctx.fill();
      ctx.strokeStyle="rgba(168,85,247,0.45)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.roundRect(cx-10,330,20,16,4);ctx.fillStyle="#180630";ctx.fill();
      glow(P,8);ctx.strokeStyle=P;ctx.lineWidth=1.4;ctx.stroke();noG();
      ctx.fillStyle=P;ctx.font="bold 9px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("β",cx,338);
      ctx.restore();

      // ── HEAD ──────────────────────────────────────────────────────
      ctx.save();ctx.translate(sway,fy);
      // Neck
      const ng=ctx.createLinearGradient(cx-10,228,cx+10,228);
      ng.addColorStop(0,"#100420");ng.addColorStop(0.5,"#1a0835");ng.addColorStop(1,"#100420");
      ctx.beginPath();ctx.roundRect(cx-10,225,20,20,3);ctx.fillStyle=ng;ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.2)";ctx.lineWidth=0.8;ctx.stroke();
      // Head base
      const hg=ctx.createRadialGradient(cx,192,0,cx,192,40);
      hg.addColorStop(0,"#2d0e50");hg.addColorStop(0.6,"#1e0838");hg.addColorStop(1,"#100420");
      ctx.beginPath();ctx.ellipse(cx,192,36,44,0,0,Math.PI*2);ctx.fillStyle=hg;ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.25)";ctx.lineWidth=1;ctx.stroke();
      // Helmet/hood
      ctx.beginPath();ctx.moveTo(cx-44,218);ctx.bezierCurveTo(cx-50,184,cx-48,148,cx-16,128);
      ctx.bezierCurveTo(cx-5,118,cx+5,118,cx+16,128);ctx.bezierCurveTo(cx+48,148,cx+50,184,cx+44,218);ctx.closePath();
      const hood=ctx.createLinearGradient(cx-50,118,cx+50,218);
      hood.addColorStop(0,"#0e0420");hood.addColorStop(0.5,"#130628");hood.addColorStop(1,"#0c0318");
      ctx.fillStyle=hood;ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.38)";ctx.lineWidth=1.3;ctx.stroke();
      // Hood peak
      ctx.beginPath();ctx.moveTo(cx-16,128);ctx.bezierCurveTo(cx-8,112,cx-2,104,cx+2,112);
      ctx.bezierCurveTo(cx+8,106,cx+16,116,cx+16,128);
      ctx.fillStyle="#060214";ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.3)";ctx.lineWidth=1;ctx.stroke();
      // Face mask
      ctx.beginPath();ctx.moveTo(cx-28,194);ctx.bezierCurveTo(cx-30,210,cx-27,224,cx-17,230);
      ctx.lineTo(cx+17,230);ctx.bezierCurveTo(cx+27,224,cx+30,210,cx+28,194);ctx.closePath();
      const mask=ctx.createLinearGradient(cx,194,cx,230);
      mask.addColorStop(0,"#1a0835");mask.addColorStop(1,"#080416");
      ctx.fillStyle=mask;ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.4)";ctx.lineWidth=1;ctx.stroke();
      // Mask tech lines
      ctx.strokeStyle="rgba(168,85,247,0.18)";ctx.lineWidth=0.5;
      [205,214,223].forEach(y=>{ctx.beginPath();ctx.moveTo(cx-24,y);ctx.lineTo(cx+24,y);ctx.stroke();});
      // Side vents
      [-1,1].forEach(s=>{
        const bx=s<0?cx-27:cx+19;
        ctx.fillStyle="rgba(168,85,247,0.12)";
        [0,6,12].forEach(dy=>{ctx.beginPath();ctx.roundRect(bx,206+dy,8,3,1);ctx.fill();ctx.strokeStyle="rgba(168,85,247,0.3)";ctx.lineWidth=0.4;ctx.stroke();});
      });
      // Visor (purple eyes - horizontal band like Alpha's but purple)
      const scanPos=((t*55)%60)-2;
      glow(P,20);
      const visor=ctx.createLinearGradient(cx-26,180,cx+26,180);
      visor.addColorStop(0,"rgba(168,85,247,0.65)");visor.addColorStop(0.5,"rgba(192,132,252,0.95)");visor.addColorStop(1,"rgba(168,85,247,0.65)");
      ctx.beginPath();ctx.roundRect(cx-26,180,52,12,5);ctx.fillStyle=visor;ctx.fill();noG();
      ctx.save();ctx.beginPath();ctx.roundRect(cx-26,180,52,12,5);ctx.clip();
      ctx.fillStyle="rgba(255,255,255,0.3)";ctx.beginPath();ctx.roundRect(cx-26+scanPos,180,7,12,2);ctx.fill();ctx.restore();
      ctx.fillStyle="rgba(255,255,255,0.25)";ctx.beginPath();ctx.roundRect(cx-20,181,18,3,2);ctx.fill();
      // Balanced indicator: two equal dots (LONG/SHORT balanced)
      glow(GR,8);ctx.fillStyle=GR;ctx.beginPath();ctx.arc(cx-8,193,2.5,0,Math.PI*2);ctx.fill();noG();
      glow(RD,8);ctx.fillStyle=RD;ctx.beginPath();ctx.arc(cx+8,193,2.5,0,Math.PI*2);ctx.fill();noG();
      ctx.restore();

      // ── ORBITERS ──────────────────────────────────────────────────
      const oCx=200+sway,oCy=295;
      orbiters.forEach(p=>{
        p.angle+=p.speed;
        glow(P,8);ctx.fillStyle=`rgba(168,85,247,${0.35+Math.sin(p.angle*4)*0.25})`;
        ctx.beginPath();ctx.arc(oCx+Math.cos(p.angle)*p.r,oCy+Math.sin(p.angle)*(p.r*0.2)+p.yMod,p.size,0,Math.PI*2);ctx.fill();
      });noG();
    }

    function render(){
      t+=0.016;const fy=Math.sin(t*0.9)*5;
      ctx.clearRect(0,0,W,H);drawBG();drawParticles();drawHeader();drawPanels();
      ctx.save();ctx.translate(0,CHAR_OFFSET);
      drawGround();drawCharacter(fy);
      ctx.restore();raf=requestAnimationFrame(render);
    }
    render();return()=>cancelAnimationFrame(raf);
  },[]);

  if (compact) return <canvas ref={canvasRef} width={400} height={520} style={{ display:"block" }} />;
  return(
    <div style={{background:"#010814",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{borderRadius:18,overflow:"hidden",border:"1px solid rgba(168,85,247,0.3)",boxShadow:"0 0 60px rgba(168,85,247,0.12), 0 0 3px rgba(168,85,247,0.28)"}}>
        <canvas ref={canvasRef} width={400} height={520} style={{display:"block"}}/>
      </div>
    </div>
  );
}
