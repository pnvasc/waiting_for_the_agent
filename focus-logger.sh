#!/bin/bash
last=""
while true; do
  app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)
  if [ "$app" != "$last" ]; then
    printf '{"t":%s,"event":"Focus","app":"%s"}\n' "$(date +%s)" "$app" >> focus.jsonl
    last="$app"
  fi
  sleep 1
done