FROM nvidia/cuda:13.4.2-runtime-ubuntu24.04

WORKDIR /src

EXPOSE 5000

RUN apt-get update -y && \
DEBIAN_FRONTEND=noninteractive apt-get install -y tzdata && \
apt-get install -y git ffmpeg software-properties-common && \
add-apt-repository -y ppa:deadsnakes/ppa && \
apt-get install -y ffmpeg python3.12 python3.12-venv python3-pip && \
mkdir server

COPY requirements.txt .

RUN python3 -m venv ce_server

RUN . server_env/bin/activate

RUN server_env/bin/pip3 install --no-cache-dir -r requirements.txt && \
  rm -rf /var/lib/apt/lists/*

COPY lang_script_main server

WORKDIR /src/server

RUN mkdir downloads

#CMD ["flask", "--app", "app", "run", "--debug", "-h", "0.0.0.0", "-p", "5000"]