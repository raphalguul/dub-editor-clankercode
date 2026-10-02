const preflight = async (whisperConfig) => {
    return await window.api.send('preflightWhisper', whisperConfig);
};

export default {
    preflight,
};
