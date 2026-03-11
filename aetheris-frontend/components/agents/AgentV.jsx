import { useEffect, useRef } from "react";
export default function AgentV({ compact = false } = {}) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf, t = 0;
    const W=400,H=520,HEADER_H=68,DIVIDER_Y=68,PANEL_Y=72,PANEL_H=58,CHAR_OFFSET=0,HEAD_KILL_Y=210;
    const AM="#f59e0b",GR="#22c55e",RD="#ef4444";
    const HEX=["0x1B2F","CALL","0xFF","WARN","0x9C","LOAD","0x44","REVERT","0x7E","0xA3","SLOAD","LOG2","0x2F","JUMP"];
    const dataStream=Array.from({length:40},()=>spawnP(true));
    const orbiters=Array.from({length:12},(_,i)=>({angle:(i/12)*Math.PI*2,r:110+(i%3)*14,speed:0.006+(i%4)*0.003,size:1.1+(i%3)*0.6,yMod:(i%5)*7-14}));
    const lensParticles=Array.from({length:18},(_,i)=>({x:(Math.random()-0.5)*80,y:(Math.random()-0.5)*80,vx:(Math.random()-0.5)*0.4,vy:(Math.random()-0.5)*0.4-0.2,alpha:Math.random(),char:HEX[Math.floor(Math.random()*HEX.length)],size:6+Math.random()*4}));
    function spawnP(r=false){return{x:18+Math.random()*364,y:r?HEAD_KILL_Y+Math.random()*(H-HEAD_KILL_Y):H+2,vy:-(0.45+Math.random()*0.75),vx:(Math.random()-0.5)*0.22,life:r?Math.random():1,char:HEX[Math.floor(Math.random()*HEX.length)],size:8+Math.random()*5};}
    const glow=(c,b)=>{ctx.shadowColor=c;ctx.shadowBlur=b;};const noG=()=>{ctx.shadowBlur=0;};

    function drawBG(){
      ctx.fillStyle="#020617";ctx.fillRect(0,0,W,H);
      const bg=ctx.createRadialGradient(200,300,0,200,300,230);
      bg.addColorStop(0,"rgba(245,158,11,0.08)");bg.addColorStop(0.6,"rgba(245,158,11,0.02)");bg.addColorStop(1,"transparent");
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(245,158,11,0.04)";ctx.lineWidth=0.5;
      for(let x=0;x<=W;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<=H;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      const v=ctx.createRadialGradient(200,280,130,200,280,310);
      v.addColorStop(0,"transparent");v.addColorStop(1,"rgba(0,0,0,0.5)");
      ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
    }

    function drawParticles(){
      ctx.textAlign="center";ctx.textBaseline="middle";
      dataStream.forEach(p=>{
        p.x+=p.vx;p.y+=p.vy;p.life-=0.003;
        if(p.life<=0||p.y<HEAD_KILL_Y){Object.assign(p,spawnP());return;}
        const fade=Math.min((p.y-HEAD_KILL_Y)/70,1);
        ctx.globalAlpha=Math.min(p.life*0.5,0.25)*fade;
        ctx.font=`${p.size}px 'Courier New',monospace`;ctx.fillStyle=AM;ctx.fillText(p.char,p.x,p.y);
      });ctx.globalAlpha=1;
    }

    function drawHeader(){
      ctx.save();
      ctx.strokeStyle="rgba(245,158,11,0.45)";ctx.lineWidth=1.4;
      const bL=14;
      [[5,5,1,1],[395,5,-1,1]].forEach(([x,y,dx,dy])=>{ctx.beginPath();ctx.moveTo(x+dx*bL,y);ctx.lineTo(x,y);ctx.lineTo(x,y+dy*bL);ctx.stroke();});
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="bold 12px 'Courier New',monospace";ctx.fillStyle="rgba(245,158,11,0.6)";
      ctx.fillText("SMART CONTRACT MONITOR  THREAT DETECTION",200,17);
      glow(AM,22);ctx.font="bold 28px 'Courier New',monospace";ctx.fillStyle="#ffffff";ctx.fillText("AGENT V",200,46);noG();
      const blink=Math.sin(t*3.5)>0;
      // ctx.fillStyle=blink?AM:"rgba(245,158,11,0.35)";glow(AM,blink?8:0);ctx.beginPath();ctx.arc(91,63,3.5,0,Math.PI*2);ctx.fill();noG();
      // ctx.fillStyle="rgba(245,158,11,0.8)";ctx.font="bold 9px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText("PHASE 1  BASE L2  ERC-4337",99,63);
      const dg=ctx.createLinearGradient(0,DIVIDER_Y,W,DIVIDER_Y);
      dg.addColorStop(0,"transparent");dg.addColorStop(0.08,"rgba(245,158,11,0.28)");dg.addColorStop(0.5,"rgba(245,158,11,0.6)");dg.addColorStop(0.92,"rgba(245,158,11,0.28)");dg.addColorStop(1,"transparent");
      ctx.strokeStyle=dg;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,DIVIDER_Y);ctx.lineTo(W,DIVIDER_Y);ctx.stroke();
      [40,100,160,200,240,300,360].forEach(x=>{ctx.strokeStyle="rgba(245,158,11,0.4)";ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(x,DIVIDER_Y-3);ctx.lineTo(x,DIVIDER_Y+3);ctx.stroke();});
      ctx.restore();
    }

    function drawPanels(){
      ctx.save();ctx.textBaseline="middle";
      function panel(x,title,rows,dotColor){
        const y=PANEL_Y,w=192,h=PANEL_H;
        ctx.fillStyle="rgba(2,10,28,0.94)";ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.fill();
        glow(AM,12);ctx.strokeStyle="rgba(245,158,11,0.5)";ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.stroke();noG();
        ctx.fillStyle="rgba(245,158,11,0.10)";ctx.beginPath();ctx.roundRect(x,y,w,16,[7,7,0,0]);ctx.fill();
        ctx.strokeStyle="rgba(245,158,11,0.15)";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(x+2,y+16);ctx.lineTo(x+w-2,y+16);ctx.stroke();
        ctx.fillStyle=AM;ctx.font="bold 9px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText(title,x+9,y+8);
        if(dotColor){const on=Math.sin(t*3.8)>0;ctx.fillStyle=on?dotColor:dotColor+"44";glow(dotColor,on?10:0);ctx.beginPath();ctx.arc(x+w-11,y+8,3.5,0,Math.PI*2);ctx.fill();noG();}
        rows.forEach(([label,value,color],i)=>{
          const ry=y+22+i*10;
          ctx.fillStyle="rgba(255,255,255,0.40)";ctx.font="8px 'Courier New',monospace";ctx.textAlign="left";ctx.fillText(label,x+9,ry);
          ctx.fillStyle=color||AM;ctx.font="bold 10px 'Courier New',monospace";ctx.textAlign="right";glow(color||AM,4);ctx.fillText(value,x+w-8,ry);noG();
        });
      }
      // panel(4,"SCAN STATUS",[["CONTRACTS","847",GR],["MONITORED","23",AM],["ALERTS","0",GR],["UPTIME","99.9%",GR]],GR);
      // panel(204,"THREAT INTEL",[["LAST SCAN","0.3s","#22d3ee"],["THREATS","0",GR],["FALSE POS","0",GR],["STATUS","CLEAR",GR]],GR);
      ctx.restore();
    }

    function drawGround(){
      const cx=200,cy=462,p=0.82+Math.sin(t*2.2)*0.18;
      const gg=ctx.createRadialGradient(cx,cy,0,cx,cy,100*p);
      gg.addColorStop(0,"rgba(245,158,11,0.07)");gg.addColorStop(0.6,"rgba(245,158,11,0.02)");gg.addColorStop(1,"transparent");
      ctx.fillStyle=gg;ctx.beginPath();ctx.ellipse(cx,cy,100*p,18,0,0,Math.PI*2);ctx.fill();
      glow(AM,12*p);ctx.strokeStyle=`rgba(245,158,11,${0.28+Math.sin(t*2.2)*0.1})`;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(cx,cy,88*p,14,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(245,158,11,${0.45+Math.sin(t*2.2)*0.12})`;ctx.lineWidth=1.8;
      ctx.beginPath();ctx.ellipse(cx,cy,60*p,10,0,0,Math.PI*2);ctx.stroke();noG();
      for(let i=0;i<10;i++){const a=(i/10)*Math.PI*2+t*0.6;glow(AM,6);ctx.fillStyle=`rgba(245,158,11,${0.4+Math.sin(t*3+i)*0.3})`;ctx.beginPath();ctx.arc(cx+Math.cos(a)*74,cy+Math.sin(a)*12,2.2,0,Math.PI*2);ctx.fill();}noG();
    }

    function drawCharacter(fy){
      const cx=200;
      const bob=Math.sin(t*1.1)*3;
      const bodyY=300+bob+fy;

      // TRENCH COAT back layer
      ctx.save();
      const coatFlap=Math.sin(t*0.7)*5;
      ctx.beginPath();
      ctx.moveTo(cx-48,bodyY-50);
      ctx.bezierCurveTo(cx-80+coatFlap,bodyY+10,cx-90+coatFlap,bodyY+80,cx-55+coatFlap,bodyY+165);
      ctx.lineTo(cx+55-coatFlap,bodyY+165);
      ctx.bezierCurveTo(cx+90-coatFlap,bodyY+80,cx+80-coatFlap,bodyY+10,cx+48,bodyY-50);
      ctx.closePath();
      const cg1=ctx.createLinearGradient(cx-90,bodyY-50,cx,bodyY+165);
      cg1.addColorStop(0,"rgba(15,8,2,0.95)");cg1.addColorStop(0.4,"rgba(22,11,3,0.85)");cg1.addColorStop(1,"rgba(10,5,1,0.3)");
      ctx.fillStyle=cg1;ctx.fill();
      glow(AM,6);ctx.strokeStyle="rgba(245,158,11,0.25)";ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(cx-48,bodyY-50);ctx.bezierCurveTo(cx-80+coatFlap,bodyY+10,cx-90+coatFlap,bodyY+80,cx-55+coatFlap,bodyY+165);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+48,bodyY-50);ctx.bezierCurveTo(cx+80-coatFlap,bodyY+10,cx+90-coatFlap,bodyY+80,cx+55-coatFlap,bodyY+165);ctx.stroke();
      noG();ctx.restore();

      // LEGS crouching
      ctx.save();
      ctx.beginPath();ctx.moveTo(cx-18,bodyY+40);ctx.bezierCurveTo(cx-22,bodyY+80,cx-32,bodyY+120,cx-38,bodyY+155);
      ctx.strokeStyle="#0d1520";ctx.lineWidth=18;ctx.lineCap="round";ctx.stroke();
      ctx.strokeStyle="rgba(245,158,11,0.18)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+18,bodyY+40);ctx.bezierCurveTo(cx+20,bodyY+75,cx+24,bodyY+115,cx+18,bodyY+155);
      ctx.strokeStyle="#0d1520";ctx.lineWidth=18;ctx.stroke();
      ctx.strokeStyle="rgba(245,158,11,0.18)";ctx.lineWidth=1;ctx.stroke();
      [[cx-42,bodyY+150],[cx+14,bodyY+150]].forEach(([bx,by],leg)=>{
        ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+(leg===0?-5:3),by+15);ctx.lineTo(bx+(leg===0?22:28),by+15);ctx.lineTo(bx+(leg===0?20:26),by);ctx.closePath();
        ctx.fillStyle="#090e18";ctx.fill();glow(AM,4);ctx.strokeStyle="rgba(245,158,11,0.4)";ctx.lineWidth=0.9;ctx.stroke();noG();
        ctx.strokeStyle="rgba(245,158,11,0.3)";ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(bx+(leg===0?-4:4),by+13);ctx.lineTo(bx+(leg===0?21:27),by+13);ctx.stroke();
      });
      ctx.restore();

      // TORSO
      ctx.save();
      ctx.beginPath();ctx.moveTo(cx-24,bodyY-48);ctx.bezierCurveTo(cx-26,bodyY-20,cx-26,bodyY+10,cx-22,bodyY+40);
      ctx.lineTo(cx+22,bodyY+40);ctx.bezierCurveTo(cx+26,bodyY+10,cx+26,bodyY-20,cx+24,bodyY-48);ctx.closePath();
      const tg=ctx.createLinearGradient(cx-26,bodyY-48,cx+26,bodyY+40);
      tg.addColorStop(0,"#1a0f02");tg.addColorStop(0.4,"#141008");tg.addColorStop(1,"#0d0906");
      ctx.fillStyle=tg;ctx.fill();ctx.strokeStyle="rgba(245,158,11,0.2)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx-8,bodyY-48);ctx.lineTo(cx-22,bodyY-20);ctx.lineTo(cx-14,bodyY+10);
      ctx.strokeStyle="rgba(245,158,11,0.35)";ctx.lineWidth=1.2;ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+8,bodyY-48);ctx.lineTo(cx+22,bodyY-20);ctx.lineTo(cx+14,bodyY+10);ctx.stroke();
      ctx.fillStyle="rgba(245,158,11,0.1)";ctx.beginPath();ctx.moveTo(cx-6,bodyY-48);ctx.lineTo(cx+6,bodyY-48);ctx.lineTo(cx+4,bodyY+10);ctx.lineTo(cx-4,bodyY+10);ctx.closePath();ctx.fill();
      glow(AM,8);ctx.strokeStyle="rgba(245,158,11,0.5)";ctx.lineWidth=0.8;ctx.stroke();noG();
      ctx.beginPath();ctx.roundRect(cx-22,bodyY+35,44,10,3);
      ctx.fillStyle="#120900";ctx.fill();ctx.strokeStyle="rgba(245,158,11,0.45)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.roundRect(cx-8,bodyY+33,16,14,3);ctx.fillStyle="#1a0e02";ctx.fill();
      glow(AM,6);ctx.strokeStyle=AM;ctx.lineWidth=1.2;ctx.stroke();noG();
      ctx.fillStyle=AM;ctx.font="bold 8px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("V",cx,bodyY+40);
      ctx.restore();

      // LEFT ARM hand on knee
      ctx.save();
      ctx.beginPath();ctx.moveTo(cx-22,bodyY-22);ctx.bezierCurveTo(cx-35,bodyY+5,cx-40,bodyY+38,cx-36,bodyY+62);
      ctx.strokeStyle="#0d1520";ctx.lineWidth=16;ctx.lineCap="round";ctx.stroke();
      ctx.strokeStyle="rgba(245,158,11,0.2)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.ellipse(cx-36,bodyY+68,8,9,0.2,0,Math.PI*2);ctx.fillStyle="#0d1520";ctx.fill();
      ctx.strokeStyle="rgba(245,158,11,0.3)";ctx.lineWidth=0.9;ctx.stroke();
      ctx.restore();

      // RIGHT ARM holding MAGNIFYING GLASS
      const glassX=cx+115,glassY=bodyY-25;
      const scanSwing=Math.sin(t*0.5)*12;
      const gX=glassX+scanSwing,gY=glassY;
      ctx.save();
      ctx.beginPath();ctx.moveTo(cx+22,bodyY-28);ctx.bezierCurveTo(cx+50,bodyY-40,cx+75,bodyY-42,gX-32,gY-10);
      ctx.strokeStyle="#0d1520";ctx.lineWidth=18;ctx.lineCap="round";ctx.stroke();
      ctx.strokeStyle="rgba(245,158,11,0.22)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(gX-32,gY-10);ctx.lineTo(gX-8,gY+10);
      ctx.strokeStyle="#0a1018";ctx.lineWidth=14;ctx.stroke();
      ctx.strokeStyle="rgba(245,158,11,0.22)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.ellipse(gX-6,gY+12,8,9,0.4,0,Math.PI*2);ctx.fillStyle="#0a1018";ctx.fill();
      ctx.strokeStyle="rgba(245,158,11,0.4)";ctx.lineWidth=0.9;ctx.stroke();
      const glassR=46;
      glow(AM,8);
      ctx.strokeStyle="#c4820a";ctx.lineWidth=5;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(gX+glassR*0.72,gY+glassR*0.72);ctx.lineTo(gX+glassR*1.0,gY+glassR*1.05);ctx.stroke();
      ctx.strokeStyle="rgba(245,158,11,0.6)";ctx.lineWidth=1.5;ctx.stroke();noG();
      glow(AM,16);
      ctx.beginPath();ctx.arc(gX,gY,glassR+3,0,Math.PI*2);
      ctx.strokeStyle=AM;ctx.lineWidth=3.5;ctx.stroke();
      ctx.strokeStyle="rgba(245,158,11,0.3)";ctx.lineWidth=1;ctx.stroke();noG();
      ctx.save();ctx.beginPath();ctx.arc(gX,gY,glassR,0,Math.PI*2);ctx.clip();
      ctx.fillStyle="rgba(20,10,2,0.88)";ctx.fill();
      lensParticles.forEach(p=>{
        p.x+=p.vx;p.y+=p.vy;p.alpha-=0.008;
        if(p.alpha<=0||Math.abs(p.x)>glassR-5||Math.abs(p.y)>glassR-5){
          p.x=(Math.random()-0.5)*(glassR*1.4);p.y=glassR-5;p.vy=-(0.3+Math.random()*0.5);p.vx=(Math.random()-0.5)*0.3;p.alpha=0.9;p.char=HEX[Math.floor(Math.random()*HEX.length)];
        }
        ctx.globalAlpha=Math.max(0,p.alpha*0.9);
        ctx.font=`${p.size}px 'Courier New',monospace`;ctx.fillStyle=AM;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(p.char,gX+p.x,gY+p.y);
      });ctx.globalAlpha=1;
      const lensLine=((t*30)%(glassR*2))-glassR;
      ctx.fillStyle="rgba(245,158,11,0.15)";ctx.fillRect(gX-glassR,gY+lensLine,glassR*2,3);
      glow(AM,12);ctx.strokeStyle=`rgba(245,158,11,${0.5+Math.sin(t*3)*0.3})`;ctx.lineWidth=0.8;
      ctx.beginPath();ctx.arc(gX,gY,14,0,Math.PI*2);ctx.stroke();
      [0,Math.PI/2,Math.PI,Math.PI*1.5].forEach(a=>{ctx.beginPath();ctx.moveTo(gX+Math.cos(a)*17,gY+Math.sin(a)*17);ctx.lineTo(gX+Math.cos(a)*22,gY+Math.sin(a)*22);ctx.stroke();});
      ctx.restore();noG();
      ctx.restore();

      // HEAD
      const headY=bodyY-78;
      ctx.save();
      const hg=ctx.createRadialGradient(cx,headY,0,cx,headY,35);
      hg.addColorStop(0,"#1e1206");hg.addColorStop(0.6,"#140e04");hg.addColorStop(1,"#0c0902");
      ctx.beginPath();ctx.ellipse(cx,headY,32,38,0,0,Math.PI*2);ctx.fillStyle=hg;ctx.fill();ctx.strokeStyle="rgba(245,158,11,0.25)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.ellipse(cx,headY-22,26,22,0,0,Math.PI*2);
      const hCrown=ctx.createLinearGradient(cx-26,headY-44,cx+26,headY-22);
      hCrown.addColorStop(0,"#0e0902");hCrown.addColorStop(0.5,"#181105");hCrown.addColorStop(1,"#0c0802");
      ctx.fillStyle=hCrown;ctx.fill();ctx.strokeStyle="rgba(245,158,11,0.3)";ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx-27,headY-22);ctx.lineTo(cx+27,headY-22);
      glow(AM,8);ctx.strokeStyle="rgba(245,158,11,0.7)";ctx.lineWidth=3.5;ctx.stroke();noG();
      ctx.beginPath();ctx.ellipse(cx,headY-8,44,10,0,0,Math.PI*2);
      const brimG=ctx.createLinearGradient(cx-44,headY-8,cx+44,headY-8);
      brimG.addColorStop(0,"#0a0700");brimG.addColorStop(0.5,"#171005");brimG.addColorStop(1,"#0a0700");
      ctx.fillStyle=brimG;ctx.fill();ctx.strokeStyle="rgba(245,158,11,0.3)";ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle="rgba(0,0,0,0.5)";ctx.beginPath();ctx.ellipse(cx,headY-4,44,6,0,0,Math.PI,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(cx-32,headY+26);ctx.lineTo(cx-18,headY+40);ctx.lineTo(cx,headY+38);ctx.lineTo(cx+18,headY+40);ctx.lineTo(cx+32,headY+26);
      ctx.strokeStyle="rgba(245,158,11,0.3)";ctx.lineWidth=6;ctx.lineJoin="round";ctx.stroke();
      ctx.strokeStyle="#0c0902";ctx.lineWidth=4;ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx-22,headY+8);ctx.bezierCurveTo(cx-24,headY+18,cx-22,headY+28,cx-14,headY+34);
      ctx.lineTo(cx+14,headY+34);ctx.bezierCurveTo(cx+22,headY+28,cx+24,headY+18,cx+22,headY+8);ctx.closePath();
      const fMask=ctx.createLinearGradient(cx,headY+8,cx,headY+34);
      fMask.addColorStop(0,"#1e1206");fMask.addColorStop(1,"#0c0902");
      ctx.fillStyle=fMask;ctx.fill();ctx.strokeStyle="rgba(245,158,11,0.25)";ctx.lineWidth=0.8;ctx.stroke();
      const eyeScan=Math.sin(t*2.8);
      glow(AM,18);
      const eyeVis=ctx.createLinearGradient(cx-20,headY+2,cx+20,headY+2);
      eyeVis.addColorStop(0,"rgba(245,158,11,0.55)");eyeVis.addColorStop(0.5,"rgba(251,191,36,0.95)");eyeVis.addColorStop(1,"rgba(245,158,11,0.55)");
      ctx.beginPath();ctx.roundRect(cx-20,headY+2,40,11,4);ctx.fillStyle=eyeVis;ctx.fill();noG();
      ctx.save();ctx.beginPath();ctx.roundRect(cx-20,headY+2,40,11,4);ctx.clip();
      const scanPos=((t*55)%44)-2;ctx.fillStyle="rgba(255,255,255,0.3)";
      ctx.beginPath();ctx.roundRect(cx-20+scanPos,headY+2,7,11,2);ctx.fill();ctx.restore();
      ctx.fillStyle="rgba(255,255,255,0.22)";ctx.beginPath();ctx.roundRect(cx-14,headY+3,14,3,2);ctx.fill();
      ctx.restore();

      // ORBITERS
      const oCx=cx,oCy=280+fy;
      orbiters.forEach(p=>{
        p.angle+=p.speed;glow(AM,8);ctx.fillStyle=`rgba(245,158,11,${0.35+Math.sin(p.angle*4)*0.25})`;
        ctx.beginPath();ctx.arc(oCx+Math.cos(p.angle)*p.r,oCy+Math.sin(p.angle)*(p.r*0.2)+p.yMod,p.size,0,Math.PI*2);ctx.fill();
      });noG();
    }

    function render(){
      t+=0.016;const fy=Math.sin(t*0.85)*5;
      ctx.clearRect(0,0,W,H);drawBG();drawParticles();drawHeader();drawPanels();
      // Scale character up ~10% around its visual center to match other agent card sizes
      ctx.save();
      const CHAR_SCALE_X=1.0,CHAR_SCALE_Y=1.23,PIVOT_X=200,PIVOT_Y=320;
      ctx.translate(PIVOT_X,PIVOT_Y+CHAR_OFFSET-31);
      ctx.scale(CHAR_SCALE_X,CHAR_SCALE_Y);
      ctx.translate(-PIVOT_X,-PIVOT_Y);
      drawGround();drawCharacter(fy);
      ctx.restore();
      raf=requestAnimationFrame(render);
    }
    render();return()=>cancelAnimationFrame(raf);
  },[]);

  if (compact) return <canvas ref={canvasRef} width={400} height={520} style={{ display:"block" }} />;
  return(
    <div style={{background:"#010814",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{borderRadius:18,overflow:"hidden",border:"1px solid rgba(245,158,11,0.3)",boxShadow:"0 0 60px rgba(245,158,11,0.10), 0 0 3px rgba(245,158,11,0.28)"}}>
        <canvas ref={canvasRef} width={400} height={520} style={{display:"block"}}/>
      </div>
    </div>
  );
}