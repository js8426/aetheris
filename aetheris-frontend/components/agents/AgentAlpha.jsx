import { useEffect, useRef } from "react";

export default function AgentAlpha({ compact = false } = {}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    let raf, t = 0;

    // ── LAYOUT CONSTANTS ──────────────────────────────────────────────────
    const W = 400, H = 520;
    const HEADER_H   = 68;   // header ends at y=68
    const DIVIDER_Y  = 68;
    const PANEL_Y    = 72;   // panels start here
    const PANEL_H    = 58;   // panel height
    const CHAR_OFFSET = 0;  // translate character DOWN so hood clears panels
    // Hood tip in original coords ≈ y103 → screen y = 103 + CHAR_OFFSET = 137
    // That's 7px below panel bottom (130). Clean gap.
    // Boot bottom ≈ 473 + 34 = 507. Fits in 520.
    const HEAD_KILL_Y = 205; // particles die at this screen-y (just below hood)

    // ── PARTICLE POOL ─────────────────────────────────────────────────────
    const CHARS = ["0xA3","0xFF","DEX","ARB","ETH","BASE","BUY","SELL","0x7E","$$$","0x2F","0xB1","0x9C","0x44"];
    const dataStream = Array.from({ length: 40 }, () => spawnP(true));

    function spawnP(randY = false) {
      return {
        x:    18 + Math.random() * 364,
        y:    randY ? HEAD_KILL_Y + Math.random() * (H - HEAD_KILL_Y) : H + 2,
        vy:  -(0.45 + Math.random() * 0.75),
        vx:   (Math.random() - 0.5) * 0.22,
        life: randY ? Math.random() : 1,
        char: CHARS[Math.floor(Math.random() * CHARS.length)],
        size: 8 + Math.random() * 5,
      };
    }

    // ── BLADE SPARKS & ORBITERS ───────────────────────────────────────────
    const bladeSparkL = Array.from({ length: 8 }, (_, i) => ({ offset:i/8, phase:Math.random()*Math.PI*2, speed:2.5+Math.random()*2, size:1+Math.random()*1.5 }));
    const bladeSparkR = Array.from({ length: 8 }, (_, i) => ({ offset:i/8, phase:Math.random()*Math.PI*2, speed:2.5+Math.random()*2, size:1+Math.random()*1.5 }));
    const orbiters    = Array.from({ length: 14 }, (_, i) => ({
      angle: (i/14)*Math.PI*2, r: 120+(i%3)*16,
      speed: 0.007+(i%4)*0.003, size: 1.2+(i%3)*0.7, yMod: (i%5)*8-16,
    }));

    const glow   = (c,b) => { ctx.shadowColor=c; ctx.shadowBlur=b; };
    const noGlow = ()    => { ctx.shadowBlur=0; };

    // ══════════════════════════════════════════════════════════════════════
    // BACKGROUND
    // ══════════════════════════════════════════════════════════════════════
    function drawBG() {
      ctx.fillStyle="#020617";
      ctx.fillRect(0,0,W,H);

      const bg=ctx.createRadialGradient(200,300,0,200,300,230);
      bg.addColorStop(0,"rgba(6,182,212,0.10)");
      bg.addColorStop(0.6,"rgba(6,182,212,0.03)");
      bg.addColorStop(1,"transparent");
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

      ctx.strokeStyle="rgba(6,182,212,0.04)"; ctx.lineWidth=0.5;
      for(let x=0;x<=W;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<=H;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

      const v=ctx.createRadialGradient(200,280,130,200,280,310);
      v.addColorStop(0,"transparent"); v.addColorStop(1,"rgba(0,0,0,0.48)");
      ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PARTICLES
    // ══════════════════════════════════════════════════════════════════════
    function drawParticles() {
      ctx.textAlign="center"; ctx.textBaseline="middle";
      dataStream.forEach(p => {
        p.x+=p.vx; p.y+=p.vy; p.life-=0.003;
        if(p.life<=0 || p.y<HEAD_KILL_Y){ Object.assign(p,spawnP()); return; }
        const fade=Math.min((p.y-HEAD_KILL_Y)/70,1);
        ctx.globalAlpha=Math.min(p.life*0.52,0.28)*fade;
        ctx.font=`${p.size}px 'Courier New',monospace`;
        ctx.fillStyle="#06b6d4";
        ctx.fillText(p.char,p.x,p.y);
      });
      ctx.globalAlpha=1;
    }

    // ══════════════════════════════════════════════════════════════════════
    // HEADER  y=0–68
    // ══════════════════════════════════════════════════════════════════════
    function drawHeader() {
      ctx.save();

      // Corner brackets
      ctx.strokeStyle="rgba(6,182,212,0.45)"; ctx.lineWidth=1.4;
      const bL=14;
      [[5,5,1,1],[395,5,-1,1]].forEach(([x,y,dx,dy])=>{
        ctx.beginPath(); ctx.moveTo(x+dx*bL,y); ctx.lineTo(x,y); ctx.lineTo(x,y+dy*bL); ctx.stroke();
      });

      ctx.textAlign="center"; ctx.textBaseline="middle";

      // Subtitle
      ctx.font="bold 12px 'Courier New',monospace";
      ctx.fillStyle="rgba(6,182,212,0.55)";
      ctx.fillText("AUTONOMOUS DEX ARBITRAGEUR", 200, 17);

      // Title
      glow("#06b6d4",22);
      ctx.font="bold 28px 'Courier New',monospace";
      ctx.fillStyle="#ffffff";
      ctx.fillText("AGENT ALPHA", 200, 46);
      noGlow();

      // Phase badge row
      // const blink=Math.sin(t*3.5)>0;
      // ctx.fillStyle=blink?"#22c55e":"rgba(34,197,94,0.35)";
      // glow("#22c55e",blink?8:0);
      // ctx.beginPath(); ctx.arc(96,63,3.5,0,Math.PI*2); ctx.fill(); noGlow();
      // ctx.fillStyle="rgba(34,197,94,0.75)";
      // ctx.font="bold 9px 'Courier New',monospace";
      // ctx.textAlign="left";
      // ctx.fillText("PHASE 1  ·  BASE L2  ·  ERC-4337", 104, 63);

      // Divider at y=68
      const dg=ctx.createLinearGradient(0,DIVIDER_Y,W,DIVIDER_Y);
      dg.addColorStop(0,"transparent"); dg.addColorStop(0.08,"rgba(6,182,212,0.28)");
      dg.addColorStop(0.5,"rgba(6,182,212,0.6)"); dg.addColorStop(0.92,"rgba(6,182,212,0.28)");
      dg.addColorStop(1,"transparent");
      ctx.strokeStyle=dg; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,DIVIDER_Y); ctx.lineTo(W,DIVIDER_Y); ctx.stroke();

      [40,100,160,200,240,300,360].forEach(x=>{
        ctx.strokeStyle="rgba(6,182,212,0.4)"; ctx.lineWidth=0.8;
        ctx.beginPath(); ctx.moveTo(x,DIVIDER_Y-3); ctx.lineTo(x,DIVIDER_Y+3); ctx.stroke();
      });

      ctx.restore();
    }

    // ══════════════════════════════════════════════════════════════════════
    // PANELS  y=72–130, two side by side, full width
    // Left:  x=4,   w=192
    // Right: x=204, w=192
    // ══════════════════════════════════════════════════════════════════════
    function drawPanels() {
      ctx.save();
      ctx.textBaseline="middle";

      function panel(x, title, rows, dotColor) {
        const y=PANEL_Y, w=192, h=PANEL_H;

        // Glass background
        ctx.fillStyle="rgba(2,10,28,0.94)";
        ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.fill();
        glow("#06b6d4",12);
        ctx.strokeStyle="rgba(6,182,212,0.5)"; ctx.lineWidth=1;
        ctx.beginPath(); ctx.roundRect(x,y,w,h,7); ctx.stroke();
        noGlow();

        // Header strip
        ctx.fillStyle="rgba(6,182,212,0.10)";
        ctx.beginPath(); ctx.roundRect(x,y,w,16,[7,7,0,0]); ctx.fill();
        ctx.strokeStyle="rgba(6,182,212,0.15)"; ctx.lineWidth=0.5;
        ctx.beginPath(); ctx.moveTo(x+2,y+16); ctx.lineTo(x+w-2,y+16); ctx.stroke();

        // Title
        ctx.fillStyle="#06b6d4";
        ctx.font="bold 9px 'Courier New',monospace";
        ctx.textAlign="left";
        ctx.fillText(title, x+9, y+8);

        // Live dot
        if(dotColor){
          const on=Math.sin(t*3.8)>0;
          ctx.fillStyle=on?dotColor:dotColor+"44";
          glow(dotColor,on?10:0);
          ctx.beginPath(); ctx.arc(x+w-11,y+8,3.5,0,Math.PI*2); ctx.fill();
          noGlow();
        }

        // 4 data rows packed into remaining h=42px → ~10.5px per row
        rows.forEach(([label,value,color],i)=>{
          const ry = y + 22 + i*10;
          ctx.fillStyle="rgba(255,255,255,0.40)";
          ctx.font="8px 'Courier New',monospace";
          ctx.textAlign="left";
          ctx.fillText(label, x+9, ry);
          ctx.fillStyle=color||"#06b6d4";
          ctx.font="bold 10px 'Courier New',monospace";
          ctx.textAlign="right";
          glow(color||"#06b6d4",4);
          ctx.fillText(value, x+w-8, ry);
          noGlow();
        });
      }

      // LEFT panel
      // panel(4, "ARB OPPORTUNITY", [
      //   ["UNISWAP V3", "$3,000.00", "#22c55e"],
      //   ["AERODROME",  "$3,003.21", "#06b6d4"],
      //   ["NET PROFIT", "+$2.87",    "#22c55e"],
      //   ["STATUS",     "SCANNING",  "#f59e0b"],
      // ], "#22c55e");

      // // RIGHT panel
      // panel(204, "EXECUTION STATS", [
      //   ["LATENCY",   "14ms",   "#22d3ee"],
      //   ["WIN RATE",  "94.2%",  "#22c55e"],
      //   ["24H TRADES","1,847",  "#06b6d4"],
      //   ["LAST GAIN", "+$2.87", "#22c55e"],
      // ], "#22d3ee");

      ctx.restore();
    }

    // ══════════════════════════════════════════════════════════════════════
    // CHARACTER PARTS (all in original coordinate space, then translated)
    // ══════════════════════════════════════════════════════════════════════

    function drawGround() {
      const cx=200, cy=462;
      const p=0.82+Math.sin(t*2.2)*0.18;
      const gg=ctx.createRadialGradient(cx,cy,0,cx,cy,105*p);
      gg.addColorStop(0,"rgba(6,182,212,0.07)"); gg.addColorStop(0.6,"rgba(6,182,212,0.02)"); gg.addColorStop(1,"transparent");
      ctx.fillStyle=gg; ctx.beginPath(); ctx.ellipse(cx,cy,105*p,20,0,0,Math.PI*2); ctx.fill();
      glow("#06b6d4",12*p);
      ctx.strokeStyle=`rgba(6,182,212,${0.28+Math.sin(t*2.2)*0.1})`; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.ellipse(cx,cy,92*p,16,0,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle=`rgba(6,182,212,${0.45+Math.sin(t*2.2)*0.12})`; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.ellipse(cx,cy,64*p,11,0,0,Math.PI*2); ctx.stroke(); noGlow();
      for(let i=0;i<10;i++){
        const a=(i/10)*Math.PI*2+t*0.6;
        glow("#06b6d4",6); ctx.fillStyle=`rgba(6,182,212,${0.4+Math.sin(t*3+i)*0.3})`;
        ctx.beginPath(); ctx.arc(cx+Math.cos(a)*78,cy+Math.sin(a)*13,2.2,0,Math.PI*2); ctx.fill();
      }
      noGlow();
    }

    function drawCloak(fy) {
      const cx=200, by=320+fy;
      const w1=Math.sin(t*1.1)*9, w2=Math.sin(t*1.3+0.8)*6, w3=Math.sin(t*0.9+1.6)*11;
      ctx.beginPath();
      ctx.moveTo(cx-64,by-30); ctx.bezierCurveTo(cx-98+w1,by+45,cx-88+w2,by+115,cx-38+w3,by+175);
      ctx.lineTo(cx+38-w3,by+175); ctx.bezierCurveTo(cx+88-w2,by+115,cx+98-w1,by+45,cx+64,by-30); ctx.closePath();
      const cg1=ctx.createLinearGradient(cx-98,by-30,cx+98,by+175);
      cg1.addColorStop(0,"rgba(1,8,22,0.95)"); cg1.addColorStop(0.4,"rgba(3,12,28,0.82)"); cg1.addColorStop(1,"rgba(1,5,14,0.18)");
      ctx.fillStyle=cg1; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx-50,by-28); ctx.bezierCurveTo(cx-76+w2,by+50,cx-68+w3,by+120,cx-24+w1,by+180);
      ctx.lineTo(cx+24-w1,by+180); ctx.bezierCurveTo(cx+68-w3,by+120,cx+76-w2,by+50,cx+50,by-28); ctx.closePath();
      const cg2=ctx.createLinearGradient(cx-76,by-28,cx,by+180);
      cg2.addColorStop(0,"rgba(6,15,35,0.9)"); cg2.addColorStop(0.5,"rgba(8,18,40,0.7)"); cg2.addColorStop(1,"rgba(4,10,25,0.2)");
      ctx.fillStyle=cg2; ctx.fill();
      glow("#06b6d4",8); ctx.strokeStyle="rgba(6,182,212,0.3)"; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(cx-64,by-30); ctx.bezierCurveTo(cx-98+w1,by+45,cx-88+w2,by+115,cx-38+w3,by+175); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+64,by-30); ctx.bezierCurveTo(cx+98-w1,by+45,cx+88-w2,by+115,cx+38-w3,by+175); ctx.stroke();
      noGlow();
      ctx.strokeStyle="rgba(6,182,212,0.08)"; ctx.lineWidth=0.8;
      [-1,1].forEach(s=>{ctx.beginPath();ctx.moveTo(cx+s*28,by-10);ctx.bezierCurveTo(cx+s*30,by+50,cx+s*35,by+110,cx+s*22,by+170);ctx.stroke();});
    }

    function drawTorso(fy) {
      const cx=200; ctx.save(); ctx.translate(0,fy);
      ctx.beginPath(); ctx.moveTo(cx-52,248); ctx.bezierCurveTo(cx-56,285,cx-58,325,cx-52,365);
      ctx.lineTo(cx+52,365); ctx.bezierCurveTo(cx+58,325,cx+56,285,cx+52,248); ctx.closePath();
      const tg=ctx.createLinearGradient(cx-52,248,cx+52,365);
      tg.addColorStop(0,"#0e2240"); tg.addColorStop(0.35,"#0c1c35"); tg.addColorStop(1,"#09152a");
      ctx.fillStyle=tg; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.2)"; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-38,252); ctx.bezierCurveTo(cx-40,288,cx-42,322,cx-37,355);
      ctx.lineTo(cx+37,355); ctx.bezierCurveTo(cx+42,322,cx+40,288,cx+38,252); ctx.closePath();
      const ag=ctx.createLinearGradient(cx,252,cx,355);
      ag.addColorStop(0,"#152e50"); ag.addColorStop(0.3,"#102240"); ag.addColorStop(1,"#0a1830");
      ctx.fillStyle=ag; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.4)"; ctx.lineWidth=1.2; ctx.stroke();
      const teh=ctx.createLinearGradient(cx-38,252,cx+38,252);
      teh.addColorStop(0,"transparent"); teh.addColorStop(0.3,"rgba(6,182,212,0.4)");
      teh.addColorStop(0.7,"rgba(6,182,212,0.4)"); teh.addColorStop(1,"transparent");
      ctx.strokeStyle=teh; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(cx-38,254); ctx.lineTo(cx+38,254); ctx.stroke();
      ctx.strokeStyle="rgba(6,182,212,0.15)"; ctx.lineWidth=0.7;
      [[cx,283],[cx-22,302],[cx+22,302],[cx,320],[cx-20,268],[cx+20,268]].forEach(([hx,hy])=>{
        ctx.beginPath();
        for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2-Math.PI/6;i===0?ctx.moveTo(hx+Math.cos(a)*11,hy+Math.sin(a)*11):ctx.lineTo(hx+Math.cos(a)*11,hy+Math.sin(a)*11);}
        ctx.closePath(); ctx.stroke();
      });
      const cp=0.6+Math.sin(t*2.8)*0.4;
      glow("#06b6d4",20*cp);
      ctx.beginPath(); ctx.moveTo(cx,278); ctx.lineTo(cx+13,292); ctx.lineTo(cx,306); ctx.lineTo(cx-13,292); ctx.closePath();
      ctx.fillStyle=`rgba(6,182,212,${0.1+cp*0.08})`; ctx.fill(); ctx.strokeStyle="#06b6d4"; ctx.lineWidth=1.2; ctx.stroke();
      const cr=ctx.createRadialGradient(cx,292,0,cx,292,5);
      cr.addColorStop(0,"#fff"); cr.addColorStop(0.4,"#22d3ee"); cr.addColorStop(1,"#06b6d4");
      ctx.fillStyle=cr; ctx.beginPath(); ctx.arc(cx,292,5,0,Math.PI*2); ctx.fill(); noGlow();
      [[cx-52,cx-48,cx-75,cx-70,cx-68,cx-50],[cx+52,cx+48,cx+75,cx+70,cx+68,cx+50]].forEach(([x0,,x2,x3,x4,x5],s)=>{
        const d=s===0?-1:1;
        ctx.beginPath(); ctx.moveTo(x0,244); ctx.bezierCurveTo(x2,235,x3+d*4,232,x4,255); ctx.bezierCurveTo(x3,272,x0+d*(-8+d*16),276,x5,270); ctx.closePath();
        const sg=ctx.createLinearGradient(x0,232,x5,276); sg.addColorStop(0,"#18355a"); sg.addColorStop(1,"#0a1828");
        ctx.fillStyle=sg; ctx.fill(); glow("#06b6d4",6); ctx.strokeStyle="rgba(6,182,212,0.55)"; ctx.lineWidth=1.2; ctx.stroke(); noGlow();
      });
      const bg2=ctx.createLinearGradient(cx-52,358,cx+52,358);
      bg2.addColorStop(0,"#0c1e36"); bg2.addColorStop(0.5,"#152d4e"); bg2.addColorStop(1,"#0c1e36");
      ctx.beginPath(); ctx.roundRect(cx-52,358,104,15,4); ctx.fillStyle=bg2; ctx.fill();
      ctx.strokeStyle="rgba(6,182,212,0.45)"; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(cx-14,356,28,19,5); ctx.fillStyle="#0c2238"; ctx.fill();
      glow("#06b6d4",8); ctx.strokeStyle="#06b6d4"; ctx.lineWidth=1.4; ctx.stroke(); noGlow();
      ctx.fillStyle="#06b6d4"; ctx.font="bold 11px monospace";
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("Α",cx,366);
      ctx.restore();
    }

    function drawLegs(fy) {
      const cx=200; ctx.save(); ctx.translate(0,fy);
      [[cx-40],[cx+12]].forEach(([x0],leg)=>{
        const lg=ctx.createLinearGradient(x0,373,x0+28,465);
        leg===0?(lg.addColorStop(0,"#0c1e38"),lg.addColorStop(1,"#080f1f")):(lg.addColorStop(0,"#0e2240"),lg.addColorStop(1,"#09122a"));
        ctx.beginPath(); ctx.roundRect(x0,373,28,50,[7,7,4,4]); ctx.fillStyle=lg; ctx.fill();
        ctx.strokeStyle="rgba(6,182,212,0.22)"; ctx.lineWidth=0.9; ctx.stroke();
        ctx.beginPath(); ctx.roundRect(x0+2,421,24,40,[4,4,5,5]); ctx.fillStyle=lg; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.roundRect(x0+3,427,20,20,3); ctx.fillStyle="rgba(6,182,212,0.11)"; ctx.fill();
        glow("#06b6d4",5); ctx.strokeStyle="rgba(6,182,212,0.45)"; ctx.lineWidth=0.8; ctx.stroke(); noGlow();
        ctx.strokeStyle="rgba(6,182,212,0.2)"; ctx.lineWidth=0.5;
        [432,438,444].forEach(y=>{ctx.beginPath();ctx.moveTo(x0+5,y);ctx.lineTo(x0+21,y);ctx.stroke();});
        const bx=x0-4;
        const bg3=ctx.createLinearGradient(bx,458,bx,473);
        bg3.addColorStop(0,"#0c1e38"); bg3.addColorStop(1,"#060d1a");
        ctx.beginPath(); ctx.moveTo(bx,458); ctx.lineTo(bx-4,473); ctx.lineTo(bx+36,473); ctx.lineTo(bx+32,458); ctx.closePath();
        ctx.fillStyle=bg3; ctx.fill();
        glow("#06b6d4",4); ctx.strokeStyle="rgba(6,182,212,0.38)"; ctx.lineWidth=0.9; ctx.stroke(); noGlow();
        ctx.strokeStyle="rgba(6,182,212,0.35)"; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(bx-3,471); ctx.lineTo(bx+34,471); ctx.stroke();
      });
      ctx.restore();
    }

    function drawArms(fy) {
      const cx=200; ctx.save(); ctx.translate(0,fy);
      const sw=Math.sin(t*0.75)*2.5;
      function arm(pts,bx,by){
        ctx.beginPath(); ctx.moveTo(pts[0],pts[1]); ctx.bezierCurveTo(pts[2],pts[3]+sw,pts[4],pts[5]+sw,pts[6],pts[7]);
        ctx.strokeStyle="#0d1e36"; ctx.lineWidth=22; ctx.lineCap="round"; ctx.stroke();
        ctx.strokeStyle="rgba(6,182,212,0.2)"; ctx.lineWidth=1.3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pts[6],pts[7]); ctx.bezierCurveTo(pts[8],pts[9],pts[10],pts[11],pts[12],pts[13]);
        ctx.strokeStyle="#0a1828"; ctx.lineWidth=17; ctx.stroke();
        ctx.strokeStyle="rgba(6,182,212,0.22)"; ctx.lineWidth=1.1; ctx.stroke();
        ctx.beginPath(); ctx.roundRect(bx,by,22,22,4); ctx.fillStyle="#142a48"; ctx.fill();
        glow("#06b6d4",6); ctx.strokeStyle="rgba(6,182,212,0.5)"; ctx.lineWidth=0.9; ctx.stroke(); noGlow();
        ctx.strokeStyle="rgba(6,182,212,0.3)"; ctx.lineWidth=0.6;
        [0,6,12].forEach(dy=>{ctx.beginPath();ctx.moveTo(bx+2,by+5+dy);ctx.lineTo(bx+20,by+5+dy);ctx.stroke();});
        ctx.beginPath(); ctx.ellipse(pts[12],pts[13]+10,9,11,0,0,Math.PI*2);
        ctx.fillStyle="#0a1828"; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.35)"; ctx.lineWidth=1; ctx.stroke();
      }
      arm([cx-50,254,cx-68,282,cx-84,315,cx-90,330,cx-96,348,cx-99,362,cx-96,372],cx-109,342);
      arm([cx+50,254,cx+68,282,cx+84,315,cx+90,330,cx+96,348,cx+99,362,cx+96,372],cx+87,342);
      ctx.restore();
    }

    function drawKatanas(fy) {
      const cx=200; ctx.save(); ctx.translate(0,fy);
      const gp=0.65+Math.sin(t*3.2)*0.35;
      function katana(tx,ty,angle,sparks){
        ctx.save(); ctx.translate(tx,ty); ctx.rotate(angle);
        glow("#06b6d4",28*gp);
        const aura=ctx.createLinearGradient(0,0,0,-125);
        aura.addColorStop(0,`rgba(6,182,212,${0.12*gp})`); aura.addColorStop(0.5,`rgba(6,182,212,${0.06*gp})`); aura.addColorStop(1,"transparent");
        ctx.fillStyle=aura; ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(-3,-118); ctx.lineTo(0,-130); ctx.lineTo(3,-118); ctx.lineTo(8,0); ctx.fill();
        const bg=ctx.createLinearGradient(-3,0,3,0);
        bg.addColorStop(0,"#0a1e35"); bg.addColorStop(0.5,"#22d3ee"); bg.addColorStop(1,"#0a1e35");
        ctx.beginPath(); ctx.moveTo(-2.8,0); ctx.lineTo(-1.8,-105); ctx.lineTo(0,-125); ctx.lineTo(1.8,-105); ctx.lineTo(2.8,0);
        ctx.fillStyle=bg; ctx.fill(); noGlow();
        ctx.strokeStyle="rgba(255,255,255,0.55)"; ctx.lineWidth=0.7;
        ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(0,-108); ctx.stroke();
        glow("#22d3ee",10*gp);
        const eg=ctx.createLinearGradient(-3,-10,-3,-115);
        eg.addColorStop(0,`rgba(34,211,238,${0.9*gp})`); eg.addColorStop(1,"rgba(34,211,238,0)");
        ctx.strokeStyle=eg; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(-2.2,-8); ctx.lineTo(-1.2,-108); ctx.stroke(); noGlow();
        const tipG=ctx.createRadialGradient(0,-122,0,0,-122,8);
        tipG.addColorStop(0,"#fff"); tipG.addColorStop(0.3,`rgba(34,211,238,${gp})`); tipG.addColorStop(1,"transparent");
        glow("#22d3ee",16*gp); ctx.fillStyle=tipG;
        ctx.beginPath(); ctx.arc(0,-122,6,0,Math.PI*2); ctx.fill(); noGlow();
        sparks.forEach(sp=>{
          sp.phase+=0.08;
          glow("#22d3ee",6); ctx.fillStyle=`rgba(34,211,238,${0.5+Math.sin(sp.phase)*0.4})`;
          ctx.beginPath(); ctx.arc(Math.sin(sp.phase*1.7)*4,-22-sp.offset*90+Math.sin(sp.phase*sp.speed)*7,sp.size,0,Math.PI*2); ctx.fill(); noGlow();
        });
        ctx.beginPath(); ctx.moveTo(-13,0); ctx.lineTo(0,-10); ctx.lineTo(13,0); ctx.lineTo(0,10); ctx.closePath();
        ctx.fillStyle="#0b2138"; ctx.fill(); glow("#06b6d4",8); ctx.strokeStyle="#06b6d4"; ctx.lineWidth=1.4; ctx.stroke(); noGlow();
        const hg=ctx.createLinearGradient(-5,0,5,0);
        hg.addColorStop(0,"#060d1a"); hg.addColorStop(0.5,"#0d1e34"); hg.addColorStop(1,"#060d1a");
        ctx.beginPath(); ctx.roundRect(-5,1,10,32,3); ctx.fillStyle=hg; ctx.fill();
        ctx.strokeStyle="rgba(6,182,212,0.25)"; ctx.lineWidth=0.8; ctx.stroke();
        ctx.strokeStyle="rgba(6,182,212,0.38)"; ctx.lineWidth=1;
        for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-5,5+i*5);ctx.lineTo(5,8+i*5);ctx.stroke();}
        ctx.beginPath(); ctx.ellipse(0,35,6,4,0,0,Math.PI*2);
        ctx.fillStyle="#0d1e34"; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.4)"; ctx.lineWidth=1; ctx.stroke();
        ctx.restore();
      }
      katana(cx-96,378+fy,-0.42,bladeSparkL);
      katana(cx+96,378+fy,0.42,bladeSparkR);
      ctx.restore();
    }

    function drawHead(fy) {
      const cx=200; ctx.save(); ctx.translate(0,fy);
      const ng=ctx.createLinearGradient(cx-13,228,cx+13,228);
      ng.addColorStop(0,"#09162a"); ng.addColorStop(0.5,"#0f2038"); ng.addColorStop(1,"#09162a");
      ctx.beginPath(); ctx.roundRect(cx-13,228,26,24,4); ctx.fillStyle=ng; ctx.fill();
      ctx.strokeStyle="rgba(6,182,212,0.2)"; ctx.lineWidth=0.8; ctx.stroke();
      const hg=ctx.createRadialGradient(cx,194,0,cx,194,46);
      hg.addColorStop(0,"#152e50"); hg.addColorStop(0.65,"#0e2040"); hg.addColorStop(1,"#091628");
      ctx.beginPath(); ctx.ellipse(cx,194,40,48,0,0,Math.PI*2);
      ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.25)"; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx-48,220); ctx.bezierCurveTo(cx-54,185,cx-52,148,cx-18,128);
      ctx.bezierCurveTo(cx-6,118,cx+6,118,cx+18,128);
      ctx.bezierCurveTo(cx+52,148,cx+54,185,cx+48,220); ctx.closePath();
      const hood=ctx.createLinearGradient(cx-54,118,cx+54,220);
      hood.addColorStop(0,"#060d1a"); hood.addColorStop(0.5,"#091628"); hood.addColorStop(1,"#07111f");
      ctx.fillStyle=hood; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.32)"; ctx.lineWidth=1.3; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx-18,128); ctx.bezierCurveTo(cx-9,112,cx-2,103,cx+3,112);
      ctx.bezierCurveTo(cx+11,106,cx+18,116,cx+18,128);
      ctx.fillStyle="#050c18"; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.28)"; ctx.lineWidth=1; ctx.stroke();
      ctx.strokeStyle="rgba(6,182,212,0.08)"; ctx.lineWidth=0.7;
      [-1,1].forEach(s=>{ctx.beginPath();ctx.moveTo(cx+s*28,148);ctx.bezierCurveTo(cx+s*26,172,cx+s*30,195,cx+s*36,214);ctx.stroke();});
      ctx.beginPath();
      ctx.moveTo(cx-30,196); ctx.bezierCurveTo(cx-33,214,cx-29,228,cx-19,235);
      ctx.lineTo(cx+19,235); ctx.bezierCurveTo(cx+29,228,cx+33,214,cx+30,196); ctx.closePath();
      const mask=ctx.createLinearGradient(cx,196,cx,235);
      mask.addColorStop(0,"#0d2035"); mask.addColorStop(1,"#060f1c");
      ctx.fillStyle=mask; ctx.fill(); ctx.strokeStyle="rgba(6,182,212,0.35)"; ctx.lineWidth=1; ctx.stroke();
      ctx.strokeStyle="rgba(6,182,212,0.18)"; ctx.lineWidth=0.5;
      [207,216,226].forEach(y=>{ctx.beginPath();ctx.moveTo(cx-26,y);ctx.lineTo(cx+26,y);ctx.stroke();});
      [-1,1].forEach(s=>{
        const bx=s<0?cx-29:cx+21;
        ctx.fillStyle="rgba(6,182,212,0.12)";
        [0,6,12].forEach(dy=>{ctx.beginPath();ctx.roundRect(bx,208+dy,8,3,1);ctx.fill();ctx.strokeStyle="rgba(6,182,212,0.3)";ctx.lineWidth=0.4;ctx.stroke();});
      });
      const scanPos=((t*55)%60)-2;
      glow("#06b6d4",18);
      const visor=ctx.createLinearGradient(cx-28,181,cx+28,194);
      visor.addColorStop(0,"rgba(6,182,212,0.65)"); visor.addColorStop(0.5,"rgba(34,211,238,0.95)"); visor.addColorStop(1,"rgba(6,182,212,0.65)");
      ctx.beginPath(); ctx.roundRect(cx-28,181,56,13,5); ctx.fillStyle=visor; ctx.fill(); noGlow();
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx-28,181,56,13,5); ctx.clip();
      ctx.fillStyle="rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.roundRect(cx-28+scanPos,181,8,13,2); ctx.fill();
      ctx.restore();
      ctx.fillStyle="rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.roundRect(cx-22,182,20,4,2); ctx.fill();
      ctx.fillStyle="#0c1e36";
      ctx.beginPath(); ctx.roundRect(cx-3,192,6,10,2); ctx.fill();
      ctx.restore();
    }

    function drawOrbiters() {
      const cx=200, cy=295;
      orbiters.forEach(p=>{
        p.angle+=p.speed;
        glow("#06b6d4",8);
        ctx.fillStyle=`rgba(6,182,212,${0.35+Math.sin(p.angle*4)*0.25})`;
        ctx.beginPath(); ctx.arc(cx+Math.cos(p.angle)*p.r,cy+Math.sin(p.angle)*(p.r*0.22)+p.yMod,p.size,0,Math.PI*2); ctx.fill();
      });
      noGlow();
    }

    // ══════════════════════════════════════════════════════════════════════
    // RENDER LOOP
    // ══════════════════════════════════════════════════════════════════════
    function render() {
      t += 0.016;
      const fy = Math.sin(t*0.85)*7;

      ctx.clearRect(0,0,W,H);

      drawBG();
      drawParticles();

      // 1. Header (y=0–68)
      drawHeader();

      // 2. Panels (y=72–130) — drawn AFTER header, no translate
      drawPanels();

      // 3. Character — translated DOWN by CHAR_OFFSET so hood (y≈103) → screen y≈137
      //    That's 7px below panel bottom at y=130. No overlap.
      ctx.save();
      ctx.translate(0, CHAR_OFFSET);
      drawGround();
      drawCloak(fy);
      drawLegs(fy);
      drawTorso(fy);
      drawArms(fy);
      drawKatanas(fy);
      drawHead(fy);
      drawOrbiters();
      ctx.restore();

      raf = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (compact) return <canvas ref={canvasRef} width={400} height={520} style={{ display:"block" }} />;

  return (
    <div style={{ background:"#010814", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ borderRadius:18, overflow:"hidden", border:"1px solid rgba(6,182,212,0.3)", boxShadow:"0 0 60px rgba(6,182,212,0.12), 0 0 3px rgba(6,182,212,0.28)" }}>
        <canvas ref={canvasRef} width={400} height={520} style={{ display:"block" }} />
      </div>
    </div>
  );
}
