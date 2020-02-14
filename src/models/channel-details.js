class ChannelDetails {
    constructor({name, id, status, title, game, viewers, emdebCode, img, thumb, description, url}) {
        this.name = name;
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
    }
}

module.exports = ChannelDetails;
