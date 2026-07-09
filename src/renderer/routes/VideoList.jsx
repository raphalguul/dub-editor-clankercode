import { useAtom } from 'jotai';
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BatchAPI from 'renderer/api/BatchAPI';
import ConfigAPI from 'renderer/api/ConfigAPI';
import { gameAtom } from 'renderer/atoms/game.atom';
import ClipTable from 'renderer/components/ClipTable';
import Interstitial from 'renderer/components/interstitial/Interstitial';

let VideoList = () => {
    const [videoMap, setVideoMap] = useState({});
    const [batchCount, setBatchCount] = useState(0);
    const [collectionMap, setCollectionMap] = useState({});
    const [config, setConfig] = useState({});
    const [game] = useAtom(gameAtom);
    const navigate = useNavigate();

    const videos = videoMap[game];
    const collections = collectionMap[game];

    const defaultFilter = config.rememberCollection
        ? config.lastCollection?.[game] || ''
        : '';

    const saveConfig = async (partial) => {
        await window.api.send('updateConfig', partial);
        setConfig(prev => ({ ...prev, ...partial }));
    };

    const loadVideos = async () => {
        let videoMapTemp = {};
        videoMapTemp['rifftrax'] = await window.api.send(
            'getVideos',
            'rifftrax'
        );
        videoMapTemp['whatthedub'] = await window.api.send(
            'getVideos',
            'whatthedub'
        );

        let collectionMapTemp = {};
        collectionMapTemp['rifftrax'] = await window.api.send(
            'getCollections',
            'rifftrax'
        );
        collectionMapTemp['whatthedub'] = await window.api.send(
            'getCollections',
            'whatthedub'
        );

        const hasBatch = await BatchAPI.hasBatch();
        const config = await ConfigAPI.getConfig();
        setVideoMap(videoMapTemp);
        setCollectionMap(collectionMapTemp);
        setBatchCount(hasBatch);
        setConfig(config);
    };

    useEffect(() => {
        loadVideos();
    }, [game]);

    if (!videos || !collections) {
        return <Interstitial isOpen={true} children={<p>Loading Media</p>} />;
    }

    return (
        <div>
            <div style={{ padding: '10px' }}>
                <label>Actions:</label>
                <Link to={`/create`}>
                    <button>New Clip</button>
                </Link>
                <Link to={`/batch`}>
                    <button>New Batch</button>
                </Link>
                {batchCount > 0 ? (
                    <Link to={`/create?batch=true`}>
                        <button>Continue Batch ({batchCount})</button>
                    </Link>
                ) : null}
            </div>
            <ClipTable
                videos={videos}
                collections={collections}
                op="open"
                opFn={(collectionId, id) => {
                    navigate(`/edit/${id}`);
                }}
                onDelete={() => {
                    loadVideos();
                }}
                onRename={() => {
                    loadVideos();
                }}
                includeDelete
                includeRename
                allowCollectionFilter
                defaultFilter={defaultFilter}
                onFilterChange={(value) => {
                    if (config.rememberCollection) {
                        saveConfig({
                            lastCollection: {
                                ...config.lastCollection,
                                [game]: value || null,
                            },
                        });
                    }
                }}
                rememberCollection={config.rememberCollection}
                onRememberChange={(checked) => {
                    saveConfig({ rememberCollection: checked });
                }}
            />
        </div>
    );
};

export default VideoList;
