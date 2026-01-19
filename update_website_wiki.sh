#!/bin/bash

cd ../bambuddy-telemetry
git add .
git commit -m "Updated telemetry"
git push

cd ../bambuddy-website
git add .
git commit -m "Updated website"
git push

cd ../bambuddy-wiki
git add .
git commit -m "Updated Wiki"
git push

cd ../spoolbuddy-website
git add .
git commit -m "Updated website"
git push

cd ../bambuddy
