#!/bin/bash
if [ "$1" = "clone" ]; then
    REPO=$2
    DIR=$3
    echo "Fake git clone for $REPO -> $DIR"
    mkdir -p "$DIR"
    curl -sL "$REPO/archive/refs/heads/main.zip" -o repo.zip
    unzip -q repo.zip
    shopt -s dotglob
    mv *-main/* "$DIR/"
    rm -rf *-main repo.zip
    exit 0
fi
/usr/bin/git "$@"
