# WallpaperSearch
archive

## Docker Image Build Steps

0. Modify Configuration Files [`st.py`]
1. `mkdir /app && cd app`
2. `npm i`
3. `docker build -t we:0.1 .`
4. `docker image build -t qiusyan/we:v0.1 .`
5. `docker save -o we.tar we:0.1`
6. `docker load -i we.tar`
7. `docker login`
8. `docker push qiusyan/we:v0.1`