# WallpaperSearch
archive

## Docker Image Build Steps

0. Modify Configuration Files [`st.py`]
1. `npm i`
2. `docker build -t we:0.1 .`
3. `docker image build -t qiusyan/we:v0.1 .`
4. `docker save -o we.tar we:0.1`
5. `docker load -i we.tar`
6. `docker login`
7. `docker push qiusyan/we:v0.1`
