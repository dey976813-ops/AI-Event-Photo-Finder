router.get("/test-storage", async (req, res, next) => {
    try {
        const { data, error } = await supabase.storage.listBuckets();

        if (error) {
            return next(error);
        }

        res.json({
            success: true,
            buckets: data.map(bucket => ({
                name: bucket.name,
                public: bucket.public
            }))
        });
    } catch (error) {
        next(error);
    }
});