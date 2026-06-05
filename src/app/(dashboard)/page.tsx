"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Heart, MessageSquare } from "lucide-react";
import ReactECharts from "echarts-for-react";

export default function PulseDashboard() {
  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: '#000',
      borderColor: 'rgba(255,255,255,0.2)',
      textStyle: { color: '#fff' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: '#A1A1AA' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: '#A1A1AA' }
    },
    series: [
      {
        name: 'New Users',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: '#fff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(255, 255, 255, 0.3)' },
              { offset: 1, color: 'rgba(255, 255, 255, 0)' }
            ]
          }
        },
        data: [120, 132, 101, 134, 90, 230, 210]
      }
    ]
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pulse Overview</h2>
        <p className="text-muted-foreground">
          Live platform heartbeat and daily metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,248</div>
            <p className="text-xs text-muted-foreground mt-1">
              +12% from last month
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Today</CardTitle>
            <Activity className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">423</div>
            <p className="text-xs text-muted-foreground mt-1">
              +4.1% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Matches Made</CardTitle>
            <Heart className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89</div>
            <p className="text-xs text-muted-foreground mt-1">
              +19% from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Messages Sent</CardTitle>
            <MessageSquare className="h-4 w-4 text-foreground" />
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
        <Card className="col-span-4 bg-card border border-border/50">
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
          </CardHeader>
          <CardContent className="pl-2 h-[300px]">
            <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
          </CardContent>
        </Card>
        <Card className="col-span-3 bg-card border border-border/50">
          <CardHeader>
            <CardTitle>Live Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 bg-foreground" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">New Match Created</p>
                  <p className="text-sm text-muted-foreground">User A and User B just matched</p>
                </div>
                <div className="text-xs text-muted-foreground">2m ago</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 bg-muted-foreground" />
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
