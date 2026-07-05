import React, { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

export default () => {
    const [searchParams] = useSearchParams();
    const { id } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        if (id) {
            navigate(`/edit/${id}/advanced`);
        } else {
            navigate(`/create/advanced?batch=${searchParams.get('batch')}`);
        }
    }, []);

    return null;
};
