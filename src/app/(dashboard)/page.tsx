"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Heart, MessageSquare } from "lucide-react";

export default function PulseDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pulse Overview</h2>
        <p className="text-muted-foreground">
          Live platform heartbeat and daily metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,248</div>
            <p className="text-xs text-muted-foreground mt-1">
              +12% from last month
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Today</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">423</div>
            <p className="text-xs text-muted-foreground mt-1">
              +4.1% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Matches Made</CardTitle>
            <Heart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89</div>
            <p className="text-xs text-muted-foreground mt-1">
              +19% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Messages Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,304</div>
            <p className="text-xs text-muted-foreground mt-1">
              +8% from yesterday
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 bg-card border-border/50">
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
          </CardHeader>
          <CardContent className="pl-2 flex items-center justify-center h-[300px] text-muted-foreground">
            {/* ECharts Area Chart will go here */}
            Chart Data Loading...
          </CardContent>
        </Card>
        <Card className="col-span-3 bg-card border-border/50">
          <CardHeader>
            <CardTitle>Live Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Dummy live feed items */}
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">New Match Created</p>
                  <p className="text-sm text-muted-foreground">User A and User B just matched</p>
                </div>
                <div className="text-xs text-muted-foreground">2m ago</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-primary/40" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">New User Registration</p>
                  <p className="text-sm text-muted-foreground">User C completed onboarding</p>
                </div>
                <div className="text-xs text-muted-foreground">15m ago</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
