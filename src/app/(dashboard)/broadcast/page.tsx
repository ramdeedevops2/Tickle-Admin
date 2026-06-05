"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function BroadcastPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Broadcast</h1>
        <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">Global Push Notifications</p>
      </div>

      <div className="border border-border/50 p-8 space-y-8">
        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Target Audience</label>
          <div className="flex gap-4">
            <Button variant="outline" className="rounded-none border-border/50 text-xs tracking-widest uppercase">All Users</Button>
            <Button variant="outline" className="rounded-none border-border/50 text-xs tracking-widest uppercase opacity-50">Active Users</Button>
            <Button variant="outline" className="rounded-none border-border/50 text-xs tracking-widest uppercase opacity-50">Premium Only</Button>
          </div>
        </div>

        <div className="space-y-3 group">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
            Notification Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-14 bg-transparent border-0 border-b border-border/50 focus-visible:ring-0 focus-visible:border-foreground rounded-none px-0 text-xl transition-all"
            placeholder="System Update"
          />
        </div>

        <div className="space-y-3 group">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-focus-within:text-foreground transition-colors">
            Payload Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full h-32 bg-transparent border border-border/50 focus:border-foreground focus:ring-0 rounded-none p-4 text-sm font-mono transition-all resize-none outline-none"
            placeholder="Enter the transmission payload..."
          />
        </div>

        <Button className="w-full h-14 bg-foreground text-background hover:bg-muted-foreground transition-colors rounded-none text-xs font-bold uppercase tracking-[0.2em]">
          Transmit Signal
        </Button>
      </div>

      <div className="border border-border/50 p-8">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">Recent Transmissions</h2>
        <div className="space-y-4 font-mono text-sm">
          <div className="flex justify-between items-center pb-4 border-b border-border/50">
            <div>
              <div className="text-foreground">Server Maintenance Notice</div>
              <div className="text-muted-foreground text-xs mt-1">Target: All Users</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">Sent</div>
              <div className="text-xs mt-1">2026-05-12 14:00</div>
            </div>
          </div>
          <div className="flex justify-between items-center pb-4 border-b border-border/50">
            <div>
              <div className="text-foreground">New Premium Features Unlocked</div>
              <div className="text-muted-foreground text-xs mt-1">Target: Premium Only</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">Sent</div>
              <div className="text-xs mt-1">2026-05-10 09:30</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
