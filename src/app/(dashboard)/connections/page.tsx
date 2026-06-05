"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heart, Search, SplitSquareHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ConnectionsPage() {
  const recentMatches = [
    { id: "1", user1: "Alex", user2: "Jordan", time: "10 mins ago", messages: 14 },
    { id: "2", user1: "Sam", user2: "Taylor", time: "1 hour ago", messages: 2 },
    { id: "3", user1: "Casey", user2: "Morgan", time: "3 hours ago", messages: 0 },
    { id: "4", user1: "Riley", user2: "Jamie", time: "5 hours ago", messages: 45 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Connections</h2>
          <p className="text-muted-foreground">
            Monitor match activity and interactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              className="pl-8 bg-transparent border border-border rounded-none"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">12,405</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Match to Message Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">68%</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Messages per Match</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">14.2</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle>Recent Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {recentMatches.map((match) => (
              <div key={match.id} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-4">
                    <Avatar className="border border-border w-12 h-12 bg-transparent">
                      <AvatarFallback className="bg-transparent text-foreground border border-border">{match.user1[0]}</AvatarFallback>
                    </Avatar>
                    <Avatar className="border border-border w-12 h-12 bg-transparent">
                      <AvatarFallback className="bg-transparent text-foreground border border-border">{match.user2[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {match.user1} & {match.user2}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{match.time}</span>
                      <span>•</span>
                      <span>{match.messages} messages</span>
                    </div>
                  </div>
                </div>
                
                <Button variant="outline" size="sm" className="border-border hover:bg-muted">
                  <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                  Unmatch
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
