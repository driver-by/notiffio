export enum SettingName {
  StreamStart = 'streamStart',
  StreamStop = 'streamStop',
  StreamProceed = 'streamProceed',
  AnnouncementAdd = 'announcementAdd',
  AnnouncementEdit = 'announcementEdit',
  AnnouncementRemove = 'announcementRemove',
  EmbedAllow = 'embedsPlus',
  EmbedRemove = 'embedsMinus',
}

export enum DiscordTextSettingName {
  StreamStart = 'stream_start',
  StreamStop = 'stream_stop',
  StreamProceed = 'stream_proceed',
  AnnouncementAdd = 'announcement_add',
  AnnouncementEdit = 'announcement_edit',
  AnnouncementRemove = 'announcement_remove',
}

export function getSettingName(setting: DiscordTextSettingName): SettingName {
  switch (setting) {
    case DiscordTextSettingName.StreamStart:
      return SettingName.StreamStart;
    case DiscordTextSettingName.StreamStop:
      return SettingName.StreamStop;
    case DiscordTextSettingName.StreamProceed:
      return SettingName.StreamProceed;
    case DiscordTextSettingName.AnnouncementAdd:
      return SettingName.AnnouncementAdd;
    case DiscordTextSettingName.AnnouncementEdit:
      return SettingName.AnnouncementEdit;
    case DiscordTextSettingName.AnnouncementRemove:
      return SettingName.AnnouncementRemove;
  }
}
