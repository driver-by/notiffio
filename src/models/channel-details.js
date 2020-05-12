class ChannelDetails {
    constructor({name, nickname, id, status, title, game, viewers, emdebCode, img, thumb, description, url, broadcast, avatar}) {
        this.name = name;
        this.nickname = nickname;
        this.id = id;
        this.status = status;
        this.title = title;
        this.game = game;
        this.viewers = viewers;
        this.embedCode = emdebCode;
        this.img = img;
        this.thumb = thumb;
        this.description = description;
        this.url = url;
        this.broadcast = broadcast;
        this.avatar = avatar;
    }
}

module.exports = ChannelDetails;
