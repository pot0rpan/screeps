# Screeps Launcher on Pi

This uses screepers/screeps-launcher

## Set up Ubuntu Server OS on Pi

Use Raspberry Pi Imager with 64bit Ubuntu Server

SSH with `ubuntu:ubuntu`

### Update packages, probably update kernel and reboot also

```bash
sudo apt update
sudo apt upgrade
```

## [Install MongoDB](https://www.mongodb.com/developer/how-to/mongodb-on-raspberry-pi/)

```bash
# Install the MongoDB 4.4 GPG key:
wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -

# Add the source location for the MongoDB packages:
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list

# Download the package details for the MongoDB packages:
sudo apt-get update

# Install MongoDB:
sudo apt-get install -y mongodb-org
```

### Run MongoDB

```bash
# Ensure mongod config is picked up:
sudo systemctl daemon-reload

# Tell systemd to run mongod on reboot:
sudo systemctl enable mongod

# Start up mongod!
sudo systemctl start mongod
```

## [Install Redis](https://www.digitalocean.com/community/tutorials/how-to-install-and-secure-redis-on-ubuntu-18-04)

```bash
sudo apt-get install redis-server
```

### Configure Redis with systemd

```bash
# /etc/redis/redis.conf

supervised systemd
```

### Restart redis

```bash
sudo systemctl restart redis.service
```

## Start screeps-launcher

```bash
./screeps-launcher
```

May have issues, check logs for missing dependencies like `make` or `python2`

## Systemd unit file for screeps-launcher

```
[Unit]
Description=screepers/screeps-launcher
After=network.target mongod.service redis-server.service redis.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/screeps
ExecStart=/home/ubuntu/screeps/screeps-launcher
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Deploying to a private server (screeps-typescript-starter)

To deploy to a private server, run the following command:

```bash
npm run push-pserver
```

If you are having trouble pushing your code, make sure to check your `screeps.json`.

For `"pserver"` the json properties are a little confusing:

- `"email"` should actually contain the username of your account on the private server you are trying to connect to, **which may be different from your account on the official Screeps shards!**

- `"password"` will need to be set for that account manually on the private server, [see here](https://github.com/screeps/screeps#authentication)

- `"hostname"` is the IP address of the server. If you are hosting your own server locally, the default localhost IP for most networks is `127.0.0.1`
