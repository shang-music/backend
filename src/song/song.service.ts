import { Injectable } from '@nestjs/common';
import {
  BitRate,
  getSong,
  Provider,
  rank,
  RankType,
  search,
} from '@s4p/music-api';
import { InjectModel } from '@s4p/nest-nmdb';
import { IModel } from '@s4p/nmdb';
import * as promiseRetry from 'promise-retry';

import { SongPeakService } from '../song-peak/song-peak.service';

@Injectable()
export class SongService {
  constructor(
    @InjectModel('Song') private readonly SongModel: IModel,
    private songPeakService: SongPeakService,
  ) {}

  async getSong(id, provider, br = BitRate.mid) {
    console.debug('getSong', id, provider, br);

    let [song, peak] = await Promise.all([
      this.getSongBaseInfo(id, provider, br),
      this.songPeakService.get(id, provider),
    ]);

    return { ...peak, provider, ...song };
  }

  async search({
    keyword,
    providers = [],
    skip = 0,
    limit = 10,
    retries = 1,
  }: {
    keyword: string;
    providers?: string[];
    skip?: number;
    limit?: number;
    retries?: number;
  }) {
    providers = providers.filter(provider => {
      return provider in Provider;
    });

    if (!providers.length) {
      providers = undefined;
    }

    return promiseRetry(
      async retry => {
        try {
          const data = await search(
            {
              keyword,
              skip,
              limit,
            },
            providers as Provider[],
          );

          return data;
        } catch (e) {
          retry(e);
        }
      },
      {
        retries,
      },
    );
  }

  async rank(provider: Provider, rankType?: RankType) {
    return rank(provider, rankType);
  }

  async getUrl(id: string, provider: Provider, br?: BitRate) {
    let baseSong = await getSong(id, provider, br);
    return baseSong.url;
  }

  private async getSongBaseInfo(id: string, provider: Provider, br?: BitRate) {
    let song = await this.SongModel.findOne({ id, provider });

    if (song) {
      return song;
    }

    return this.rebuildBase(id, provider, br);
  }

  private async rebuildBase(
    id: string,
    provider: Provider,
    br?: BitRate,
  ): Promise<any> {
    let baseSong = await getSong(id, provider, br);

    delete baseSong.url;

    await this.SongModel.updateOne(
      {
        id: baseSong.id,
        provider,
      },
      {
        $set: {
          provider,
          ...baseSong,
        },
      },
      {
        upsert: true,
      },
    );

    return baseSong;
  }
}